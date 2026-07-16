import { NextResponse } from "next/server";
import {
  createInvitedUser,
  emailExists,
  ensureAuthSchema,
  listCompanyUsers,
  loginIdExists,
} from "@/lib/authDb";
import { getSessionWithRole } from "@/lib/session";
import { getSql } from "@/lib/neon";
import { getMailer } from "@/lib/mailer";
import {
  ensurePasswordResetSchema,
  generateResetToken,
  hashResetToken,
  resetLinkBase,
} from "@/lib/passwordReset";

export const runtime = "nodejs";

// 招待リンクの有効期限は長め（7日）。パスワード未設定のまま失効しにくくする。
const INVITE_TOKEN_TTL_MINUTES = 7 * 24 * 60;

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
// 社員番号は半角英数と - _ のみ（1〜64文字）
const isLoginId = (s: string) => /^[A-Za-z0-9_-]{1,64}$/.test(s);

/** メンバー一覧（管理者限定）。 */
export async function GET() {
  const s = await getSessionWithRole();
  if (!s) return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
  if (s.role !== "admin") {
    return NextResponse.json({ message: "権限がありません。" }, { status: 403 });
  }
  try {
    const members = await listCompanyUsers(s.companyId);
    return NextResponse.json({ members });
  } catch (err) {
    console.error("[members] list error:", err);
    return NextResponse.json({ message: "取得に失敗しました。" }, { status: 500 });
  }
}

/** メンバー招待（管理者限定）。招待ユーザー作成＋招待リンク発行＋招待メール送信。 */
export async function POST(req: Request) {
  const s = await getSessionWithRole();
  if (!s) return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
  if (s.role !== "admin") {
    return NextResponse.json({ message: "権限がありません。" }, { status: 403 });
  }
  if (s.isDemo) {
    return NextResponse.json(
      { message: "デモではメンバーを追加できません。" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const loginId = (body.loginId ?? "").toString().trim();
    const name = (body.name ?? "").toString().trim();
    const email = (body.email ?? "").toString().trim().toLowerCase() || null;
    const role: "admin" | "member" = body.role === "admin" ? "admin" : "member";
    // 所属工場（任意）。空欄は全工場（NULL）
    const factory = (body.factory ?? "").toString().trim() || null;
    if (factory && factory.length > 100) {
      return NextResponse.json(
        { message: "所属工場は100文字以内で入力してください。" },
        { status: 400 }
      );
    }

    if (!loginId) {
      return NextResponse.json({ message: "社員番号を入力してください。" }, { status: 400 });
    }
    if (!isLoginId(loginId)) {
      return NextResponse.json(
        { message: "社員番号は半角英数字とハイフン・アンダースコアのみで入力してください。" },
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json({ message: "お名前を入力してください。" }, { status: 400 });
    }
    // メールアドレスは任意（未入力なら招待リンクを直接本人に伝える運用）
    if (email && (!isEmail(email) || email.length > 254)) {
      return NextResponse.json(
        { message: "メールアドレスの形式が正しくありません。" },
        { status: 400 }
      );
    }

    await ensureAuthSchema();
    if (await loginIdExists(loginId)) {
      return NextResponse.json(
        { message: "この社員番号は既に登録されています。" },
        { status: 409 }
      );
    }
    if (email && (await emailExists(email))) {
      return NextResponse.json(
        { message: "このメールアドレスは既に登録されています。" },
        { status: 409 }
      );
    }

    const userId = await createInvitedUser(s.companyId, loginId, email, name, role, factory);

    // 招待リンク用トークンを発行（生トークンはリンクにのみ載せ、DBはハッシュだけ保存）
    await ensurePasswordResetSchema();
    const token = generateResetToken();
    const sql = getSql();
    await sql`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES (${userId}, ${hashResetToken(token)},
              NOW() + make_interval(mins => ${INVITE_TOKEN_TTL_MINUTES}))`;

    const inviteUrl = `${resetLinkBase()}/password-reset/confirm?token=${token}`;

    // メールアドレスあり・メーラー設定済みのときだけ送信（いずれの場合も inviteUrl は返す）
    const mailer = getMailer();
    if (email && mailer) {
      try {
        await mailer.send({
          from:
            process.env.CONTACT_FROM ||
            process.env.ALERT_MAIL_FROM ||
            process.env.MAIL_FROM ||
            "PF設備管理 <noreply@sumakouba.com>",
          to: [email],
          subject: "【PF設備管理】アカウント発行のご案内",
          text:
            `${name} 様\n\n` +
            `PF設備管理の管理者からアカウントが発行されました。\n` +
            `以下のリンクから7日以内にパスワードを設定してください。\n\n` +
            `${inviteUrl}\n\n` +
            `パスワードを設定すると、そのままログインできるようになります。\n` +
            `心当たりがない場合は、このメールを破棄してください。\n\n` +
            `──\nPF設備管理\n運営：PF運営事務局\n`,
        });
      } catch (e) {
        console.warn("[members] invite mail send failed:", (e as Error).message);
      }
    } else {
      console.warn("[members] no email or mailer not configured, returning inviteUrl only");
    }

    return NextResponse.json({ ok: true, inviteUrl }, { status: 201 });
  } catch (err) {
    console.error("[members] invite error:", err);
    return NextResponse.json({ message: "招待に失敗しました。" }, { status: 500 });
  }
}
