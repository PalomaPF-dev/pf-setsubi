import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/session";
import { createWorker, deleteWorker, listWorkers } from "@/lib/db";

export const runtime = "nodejs";

const MAX_NAME_LENGTH = 50;

/**
 * 作業者（アプリ内名簿）API。
 * アカウントはポータルで払い出す共有アカウントのみのため、作業者はアカウントを
 * 持たず名前だけを登録する。ログイン中のアカウントなら誰でも管理できる。
 */

/** 作業者一覧（会社スコープ）。 */
export async function GET() {
  const user = await getOptionalSession();
  if (!user) return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
  try {
    const workers = await listWorkers(user.companyId);
    return NextResponse.json({ workers });
  } catch (err) {
    console.error("[workers] list error:", err);
    return NextResponse.json({ message: "取得に失敗しました。" }, { status: 500 });
  }
}

/** 作業者を追加。{ name } を受け取る。 */
export async function POST(req: Request) {
  const user = await getOptionalSession();
  if (!user) return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const name = (body.name ?? "").toString().trim();
    if (!name) {
      return NextResponse.json({ message: "作業者名を入力してください。" }, { status: 400 });
    }
    if (name.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { message: `作業者名は${MAX_NAME_LENGTH}文字以内で入力してください。` },
        { status: 400 }
      );
    }
    const worker = await createWorker(user.companyId, name);
    if (!worker) {
      return NextResponse.json(
        { message: "同じ名前の作業者が既に登録されています。" },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true, worker }, { status: 201 });
  } catch (err) {
    console.error("[workers] create error:", err);
    return NextResponse.json({ message: "追加に失敗しました。" }, { status: 500 });
  }
}

/** 作業者を削除。{ id } を受け取る。過去の記録の氏名はそのまま残る。 */
export async function DELETE(req: Request) {
  const user = await getOptionalSession();
  if (!user) return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const id = (body.id ?? "").toString().trim();
    if (!id) {
      return NextResponse.json({ message: "作業者IDが指定されていません。" }, { status: 400 });
    }
    await deleteWorker(user.companyId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[workers] delete error:", err);
    return NextResponse.json({ message: "削除に失敗しました。" }, { status: 500 });
  }
}
