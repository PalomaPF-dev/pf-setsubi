import { NextResponse } from "next/server";
import { createDemoSession } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// コールドスタート＋サンプルデータ投入で時間がかかることがある（最大1分）
export const maxDuration = 60;

/**
 * 使い捨てデモを用意し、サインイン用の email / password を返す（ログイン不要・公開）。
 * クライアントはこの認証情報で signIn してデモ会社に入る。
 * 毎回独立したデモ会社を作るため、二重実行しても既存データを壊さない（冪等）。
 */
export async function POST() {
  try {
    const creds = await createDemoSession();
    return NextResponse.json(creds, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[demo] create error:", e);
    return NextResponse.json({ message: "デモの準備に失敗しました。" }, { status: 503 });
  }
}
