import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/session";
import { listWorkers } from "@/lib/db";

export const runtime = "nodejs";

/**
 * 作業者API。
 * 作業者はポータルが users.role='worker' として発行するアカウントになったため、
 * 一覧は users から返す。追加・削除（旧・アプリ内名簿）は廃止（410）。
 */

/** 作業者一覧（会社スコープ。users の role='worker'）。 */
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

/** （廃止）作業者の追加はポータルで行う。 */
export async function POST() {
  return NextResponse.json(
    { error: "作業者アカウントはポータルのユーザー設定で管理します。" },
    { status: 410 }
  );
}

/** （廃止）作業者の削除はポータルで行う。 */
export async function DELETE() {
  return NextResponse.json(
    { error: "作業者アカウントはポータルのユーザー設定で管理します。" },
    { status: 410 }
  );
}
