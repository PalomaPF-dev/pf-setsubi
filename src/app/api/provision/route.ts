import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import {
  createInvitedUser,
  ensureAuthSchema,
  getOrCreateCompanyByName,
} from "@/lib/authDb";
import { getSql } from "@/lib/neon";
import { getMailer } from "@/lib/mailer";
import {
  ensurePasswordResetSchema,
  generateResetToken,
  hashResetToken,
  resetLinkBase,
} from "@/lib/passwordReset";

export const runtime = "nodejs";

/**
 * ポータルからの一括アカウント発行API（内部用・UIなし）。
 * 認証はセッションではなく共有キー PF_PROVISION_KEY（未設定なら 503 で無効化）。
 * members API（招待）と同じ流れで、複数ユーザーをまとめて発行して招待リンクを返す。
 */

// 招待リンクの有効期限は members API と同じ7日
const INVITE_TOKEN_TTL_MINUTES = 7 * 24 * 60;
// 1リクエストで発行できる上限件数
const MAX_USERS_PER_REQUEST = 200;
// 発行先の会社（統一管理者ブートストラップと同じ固定値）
const PROVISION_COMPANY_NAME = "株式会社パロマ";

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
// 社員番号は半角英数と - _ のみ（1〜64文字）
const isLoginId = (s: string) => /^[A-Za-z0-9_-]{1,64}$/.test(s);

/** タイミング安全なキー比較（長さ違いは即 false 扱い）。 */
function safeKeyEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

type ProvisionResult = {
  loginId: string;
  status: "created" | "exists" | "error";
  passwordSet?: boolean;
  inviteUrl?: string;
  message?: string;
};

/** 招待メール送信（members API の文面を流用）。失敗しても throw しない。 */
async function sendInviteMail(name: string, email: string, inviteUrl: string): Promise<void> {
  const mailer = getMailer();
  if (!mailer) {
    console.warn("[provision] mailer not configured, skipping invite mail");
    return;
  }
  try {
    await mailer.send({
      from:
        process.env.CONTACT_FROM ||
        process.env.ALERT_MAIL_FROM ||
        process.env.MAIL_FROM ||
        "PF設備管理 <noreply@paloma-pf.com>",
      to: [email],
      subject: "【PF設備管理】アカウント発行のご案内",
      text:
        `${name} 様\n\n` +
        `PF設備管理の管理者からアカウントが発行されました。\n` +
        `以下のリンクから7日以内にパスワードを設定してください。\n\n` +
        `${inviteUrl}\n\n` +
        `パスワードを設定すると、そのままログインできるようになります。\n` +
        `心当たりがない場合は、このメールを破棄してください。\n\n` +
        `──\nPF設備管理\n`,
    });
  } catch (e) {
    console.warn("[provision] invite mail send failed:", (e as Error).message);
  }
}

export async function POST(req: Request) {
  const provisionKey = process.env.PF_PROVISION_KEY;
  if (!provisionKey) {
    return NextResponse.json({ message: "provision未設定" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const key = typeof body.key === "string" ? body.key : "";
  if (!safeKeyEqual(key, provisionKey)) {
    return NextResponse.json({ message: "認証に失敗しました。" }, { status: 401 });
  }

  const users = body.users;
  if (!Array.isArray(users) || users.length === 0) {
    return NextResponse.json({ message: "users を指定してください。" }, { status: 400 });
  }
  if (users.length > MAX_USERS_PER_REQUEST) {
    return NextResponse.json(
      { message: `一度に発行できるのは最大${MAX_USERS_PER_REQUEST}件です。` },
      { status: 400 }
    );
  }
  const regenerateLinks = body.regenerateLinks === true;

  try {
    await ensureAuthSchema();
    await ensurePasswordResetSchema();
    const companyId = await getOrCreateCompanyByName(PROVISION_COMPANY_NAME);
    const sql = getSql();

    const results: ProvisionResult[] = [];
    for (const u of users) {
      const loginId = (u?.loginId ?? "").toString().trim();
      try {
        if (!isLoginId(loginId)) {
          results.push({
            loginId,
            status: "error",
            message: "社員番号は半角英数字とハイフン・アンダースコア（1〜64文字）で入力してください。",
          });
          continue;
        }
        if (loginId === "admin") {
          results.push({
            loginId,
            status: "error",
            message: "社員番号 'admin' は発行できません。",
          });
          continue;
        }
        const name = (u?.name ?? "").toString().trim();
        const email = ((u?.email ?? "").toString().trim().toLowerCase() as string) || null;
        const role: "admin" | "member" = u?.role === "admin" ? "admin" : "member";
        // 指名承認者（承認者の login_id）。null/空文字は「指名なし」。
        const approverLoginId: string | null =
          ((u?.approverLoginId ?? "").toString().trim() as string) || null;
        if (approverLoginId && !isLoginId(approverLoginId)) {
          results.push({
            loginId,
            status: "error",
            message:
              "承認者の社員番号は半角英数字とハイフン・アンダースコア（1〜64文字）で入力してください。",
          });
          continue;
        }
        if (email && (!isEmail(email) || email.length > 254)) {
          results.push({
            loginId,
            status: "error",
            message: "メールアドレスの形式が正しくありません。",
          });
          continue;
        }
        // 所属工場（任意・100字以内）。空文字は「全工場（NULL）」として扱う。
        // undefined（キー未指定）は「変更しない」＝既存ユーザーの factory を保持する。
        const factoryProvided = u?.factory !== undefined && u?.factory !== null;
        const factory: string | null = factoryProvided
          ? (u.factory.toString().trim() as string) || null
          : null;
        if (factoryProvided && factory && factory.length > 100) {
          results.push({
            loginId,
            status: "error",
            message: "所属工場は100文字以内で入力してください。",
          });
          continue;
        }

        // 既存ユーザー（login_id 一致）: provision v2 では name / role / approver_login_id
        // （email は指定があるときのみ）を最新の内容に更新し、factory は渡されたときだけ更新。
        // regenerateLinks のときだけ設定リンクを再発行。ステータスは従来どおり "exists"。
        const existing = await sql`SELECT id, pending FROM users WHERE login_id = ${loginId} LIMIT 1`;
        if (existing.length > 0) {
          await sql`
            UPDATE users SET
              name = CASE WHEN ${name} <> '' THEN ${name} ELSE name END,
              role = ${role},
              approver_login_id = ${approverLoginId},
              email = COALESCE(${email}, email)
            WHERE id = ${existing[0].id}`;
          if (factoryProvided) {
            await sql`UPDATE users SET factory = ${factory} WHERE id = ${existing[0].id}`;
          }
          if (!regenerateLinks) {
            results.push({ loginId, status: "exists", passwordSet: !existing[0].pending });
            continue;
          }
          const userId = existing[0].id as string;
          const token = generateResetToken();
          await sql`
            INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
            VALUES (${userId}, ${hashResetToken(token)},
                    NOW() + make_interval(mins => ${INVITE_TOKEN_TTL_MINUTES}))`;
          results.push({
            loginId,
            status: "exists",
            passwordSet: !existing[0].pending,
            inviteUrl: `${resetLinkBase()}/password-reset/confirm?token=${token}`,
          });
          continue;
        }

        if (!name) {
          results.push({ loginId, status: "error", message: "お名前を入力してください。" });
          continue;
        }

        // 新規発行: 招待ユーザー作成 → 設定リンク発行 →（メールがあれば）送信
        const userId = await createInvitedUser(
          companyId,
          loginId,
          email,
          name,
          role,
          factory,
          approverLoginId
        );
        const token = generateResetToken();
        await sql`
          INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
          VALUES (${userId}, ${hashResetToken(token)},
                  NOW() + make_interval(mins => ${INVITE_TOKEN_TTL_MINUTES}))`;
        const inviteUrl = `${resetLinkBase()}/password-reset/confirm?token=${token}`;
        if (email) await sendInviteMail(name, email, inviteUrl);
        results.push({ loginId, status: "created", passwordSet: false, inviteUrl });
      } catch (e) {
        // email 一意制約違反などもここに落として続行
        results.push({ loginId, status: "error", message: (e as Error).message });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[provision] error:", err);
    return NextResponse.json({ message: "一括発行に失敗しました。" }, { status: 500 });
  }
}
