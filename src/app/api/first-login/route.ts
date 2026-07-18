import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSql } from "@/lib/neon";
import { ensureAuthSchema } from "@/lib/authDb";

export const runtime = "nodejs";

/**
 * 初回パスワード設定（社員番号のみで発行されたアカウント向け）。
 * 管理者がポータルから発行したユーザー（pending=true・パスワード未設定）が、
 * メールなしで自分の最初のパスワードを設定できるようにする。
 * ハッシュ方式は登録処理（authDb.createUser）と同じ bcryptjs・コスト12。
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const loginId = (body.loginId ?? "").toString().trim();
    const password = (body.password ?? "").toString();

    // login_id 列などを冪等に整えてから処理（初回アクセス直後でも動くように）。失敗しても続行。
    try {
      await ensureAuthSchema();
    } catch {
      /* スキーマ初期化の一時失敗では処理自体は止めない */
    }

    const sql = getSql();
    // authorize() と同じ2段階検索: ①社員番号（login_id）→ ②従来のメールアドレス
    let rows = await sql`
      SELECT id, pending FROM users WHERE login_id = ${loginId} LIMIT 1`;
    if (rows.length === 0) {
      rows = await sql`
        SELECT id, pending FROM users WHERE email = ${loginId.toLowerCase()} LIMIT 1`;
    }
    const user = rows[0];
    if (!user) {
      return NextResponse.json(
        { error: "該当するアカウントが見つかりません。社員番号をご確認ください。" },
        { status: 404 }
      );
    }
    // 既にパスワード設定済みのアカウントは上書きさせない（乗っ取り防止）
    if (!user.pending) {
      return NextResponse.json(
        {
          error:
            "このアカウントは既にパスワード設定済みです。ログイン画面からログインしてください。パスワードを忘れた場合は管理者に再発行を依頼してください。",
        },
        { status: 409 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "パスワードは8文字以上で設定してください。" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    // パスワード設定成功で pending を解除（招待完了）
    await sql`
      UPDATE users SET password_hash = ${passwordHash}, pending = false
      WHERE id = ${user.id as string}`;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[first-login] error:", err);
    return NextResponse.json(
      { error: "設定に失敗しました。時間をおいて再度お試しください。" },
      { status: 500 }
    );
  }
}
