import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getUserRole } from "@/lib/authDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/role — ログイン中ユーザーの役割（admin/member/worker）を返す。
// role は JWT に載せず DB から都度取得する（ポータル側の変更が即時反映される）。
export async function GET() {
  const session = await getServerSession(authOptions);
  const uid = session?.user?.id;
  if (!uid) return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
  try {
    const role = await getUserRole(uid);
    return NextResponse.json({ role }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[role] error:", err);
    return NextResponse.json({ message: "取得に失敗しました。" }, { status: 500 });
  }
}
