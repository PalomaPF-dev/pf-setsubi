import { NextResponse } from "next/server";
import { countAdmins, createCompany, createUser, emailExists, ensureAuthSchema } from "@/lib/authDb";

export const runtime = "nodejs";

/**
 * 初期セットアップ（初回だけの「管理者アカウント作成」）。
 * 以後のアカウントは管理者がメンバー管理から発行する（自己登録は不可）。
 */
export async function POST(req: Request) {
  try {
    const { companyName, userName, email, password } = await req.json();

    if (!companyName?.trim() || !userName?.trim() || !email?.trim() || !password) {
      return NextResponse.json({ message: "全ての項目を入力してください。" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ message: "パスワードは8文字以上にしてください。" }, { status: 400 });
    }

    await ensureAuthSchema();

    // 既に管理者が存在する＝初期セットアップ済み。以後の自己登録は禁止（管理者が発行する）。
    if ((await countAdmins()) > 0) {
      return NextResponse.json(
        { message: "アカウントは管理者が発行します。" },
        { status: 403 }
      );
    }

    const normEmail = email.toLowerCase().trim();
    if (await emailExists(normEmail)) {
      return NextResponse.json({ message: "このメールアドレスは既に登録されています。" }, { status: 409 });
    }

    const companyId = await createCompany(companyName.trim());
    // 初回だけ有効な「管理者アカウント作成」＝最初のユーザーを admin にする。
    // 管理者IDは全アプリ共通の 'admin'（社員番号ログイン用）。
    await createUser(companyId, normEmail, userName.trim(), password, "admin", "admin");

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[register] error:", err);
    return NextResponse.json({ message: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
