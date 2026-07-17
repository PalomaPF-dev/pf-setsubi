import { NextResponse } from "next/server";
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

// 再発行リンクの有効期限は招待と同じ7日（メール未登録者への手渡し運用を想定）。
const RESET_LINK_TTL_MINUTES = 7 * 24 * 60;

/**
 * パスワード設定リンクの再発行（管理者限定）。
 * メール未登録・メール不達のメンバーがパスワードを忘れた場合の救済手段。
 * 新しい設定リンクを返し、メールアドレスが登録されていれば送信もする。
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSessionWithRole();
  if (!s) return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
  if (s.role !== "admin") {
    return NextResponse.json({ message: "権限がありません。" }, { status: 403 });
  }
  if (s.isDemo) {
    return NextResponse.json({ message: "デモでは操作できません。" }, { status: 403 });
  }

  try {
    const { id } = await ctx.params;
    const sql = getSql();
    // 対象は自社ユーザーのみ（他社ユーザーは 404）
    const rows = await sql`
      SELECT id, name, email, login_id
      FROM users
      WHERE id = ${id} AND company_id = ${s.companyId}
      LIMIT 1`;
    const target = rows[0];
    if (!target) {
      return NextResponse.json({ message: "ユーザーが見つかりません。" }, { status: 404 });
    }

    await ensurePasswordResetSchema();
    const token = generateResetToken();
    await sql`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES (${target.id as string}, ${hashResetToken(token)},
              NOW() + make_interval(mins => ${RESET_LINK_TTL_MINUTES}))`;

    const resetUrl = `${resetLinkBase()}/password-reset/confirm?token=${token}`;

    // メールアドレスが登録されていれば送信（未登録でもリンクを返して手渡しできる）
    const email = (target.email as string | null) ?? null;
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
          subject: "【PF設備管理】パスワード設定リンクのご案内",
          text:
            `${target.name as string} 様\n\n` +
            `PF設備管理の管理者がパスワード設定リンクを再発行しました。\n` +
            `以下のリンクから7日以内にパスワードを設定してください。\n\n` +
            `${resetUrl}\n\n` +
            `パスワードを設定すると、そのままログインできるようになります。\n` +
            `心当たりがない場合は、このメールを破棄してください。\n\n` +
            `──\nPF設備管理\n`,
        });
      } catch (e) {
        console.warn("[members] reset-link mail send failed:", (e as Error).message);
      }
    }

    return NextResponse.json({ ok: true, resetUrl });
  } catch (err) {
    console.error("[members] reset-link error:", err);
    return NextResponse.json({ message: "再発行に失敗しました。" }, { status: 500 });
  }
}
