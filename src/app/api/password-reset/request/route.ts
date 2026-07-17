import { NextResponse } from "next/server";
import { getSql } from "@/lib/neon";
import { getMailer } from "@/lib/mailer";
import {
  ensurePasswordResetSchema,
  generateResetToken,
  hashResetToken,
  resetLinkBase,
  RESET_TOKEN_TTL_MINUTES,
} from "@/lib/passwordReset";

export const runtime = "nodejs";

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// 簡易レート制限（同一メール／IP で 10分5回。in-memory＝インスタンス単位のベストエフォート）
const RL = new Map<string, number[]>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const WIN = 10 * 60 * 1000;
  const MAX = 5;
  const arr = (RL.get(key) ?? []).filter((t) => now - t < WIN);
  if (arr.length >= MAX) {
    RL.set(key, arr);
    return true;
  }
  arr.push(now);
  RL.set(key, arr);
  return false;
}

/**
 * パスワード再設定メールの送信リクエスト。
 * アカウントの有無に関わらず常に { ok: true } を返す（メールアドレスの列挙攻撃防止）。
 */
export async function POST(req: Request) {
  try {
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    const body = await req.json().catch(() => ({}));
    const email = (body.email ?? "").toString().trim().toLowerCase();

    if (!email || !isEmail(email) || email.length > 254) {
      return NextResponse.json(
        { message: "メールアドレスの形式が正しくありません。" },
        { status: 400 }
      );
    }
    if (rateLimited(`ip:${ip}`) || rateLimited(`mail:${email}`)) {
      return NextResponse.json(
        { message: "送信が多すぎます。10分ほど時間をおいて再度お試しください。" },
        { status: 429 }
      );
    }

    await ensurePasswordResetSchema();
    const sql = getSql();
    const rows = await sql`
      SELECT u.id, c.is_demo
      FROM users u JOIN companies c ON c.id = u.company_id
      WHERE u.email = ${email} LIMIT 1`;
    const user = rows[0];

    // 存在する（かつデモ会社でない）場合のみトークンを発行してメール送信
    if (user && !user.is_demo) {
      const token = generateResetToken();
      await sql`
        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
        VALUES (${user.id as string}, ${hashResetToken(token)},
                NOW() + make_interval(mins => ${RESET_TOKEN_TTL_MINUTES}))`;

      const url = `${resetLinkBase()}/password-reset/confirm?token=${token}`;
      const mailer = getMailer();
      if (mailer) {
        try {
          await mailer.send({
            from:
              process.env.CONTACT_FROM ||
              process.env.ALERT_MAIL_FROM ||
              process.env.MAIL_FROM ||
              "PF設備 <noreply@sumakouba.com>",
            to: [email],
            subject: "【PF設備管理】パスワード再設定のご案内",
            text:
              `PF設備管理をご利用いただきありがとうございます。\n\n` +
              `パスワード再設定のリクエストを受け付けました。\n` +
              `以下のリンクから${RESET_TOKEN_TTL_MINUTES}分以内に再設定してください。\n\n` +
              `${url}\n\n` +
              `心当たりがない場合は、このメールを破棄してください（パスワードは変更されません）。\n\n` +
              `──\nPF設備管理\n`,
          });
        } catch (e) {
          console.warn("[password-reset] mail send failed:", (e as Error).message);
        }
      } else {
        console.warn("[password-reset] mailer not configured, skip sending");
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[password-reset] request error:", err);
    return NextResponse.json(
      { message: "送信に失敗しました。時間をおいて再度お試しください。" },
      { status: 500 }
    );
  }
}
