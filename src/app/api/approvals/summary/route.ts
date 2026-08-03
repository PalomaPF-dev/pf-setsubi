import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { pendingApprovalCount, pendingRecordCountAllRealCompanies } from "@/lib/db";
import { getSql } from "@/lib/neon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ポータル集計用API（内部用・UIなし）。
 * 認証は provision API と同じ共有キー PF_PROVISION_KEY（未設定なら 503 で無効化）。
 * 承認待ち点検記録（inspection_records.approval_status='pending'）の件数を返す。
 *
 * POST /api/approvals/summary
 * body: { key: string, loginId?: string }
 * → { pending: number }
 *
 * loginId を渡すと「その人がいま承認の番」（提出者の指定承認者＝本人）の件数だけを返す。
 * 承認は管理者権限のため、管理者以外・未登録の社員番号は 0。
 * loginId 無しは従来どおり実会社（デモ以外）の総数（互換用）。
 */

/** タイミング安全なキー比較（長さ違いは即 false 扱い）。 */
function safeKeyEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
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

  const loginId =
    typeof (body as { loginId?: unknown }).loginId === "string"
      ? ((body as { loginId: string }).loginId ?? "").trim()
      : "";

  try {
    if (loginId) {
      // その人がいま承認の番の件数（承認は管理者のみ。未登録・非管理者は 0）
      const sql = getSql();
      const rows = (await sql`
        SELECT company_id, role FROM users WHERE login_id = ${loginId} LIMIT 1`) as {
        company_id: string;
        role: string | null;
      }[];
      const user = rows[0];
      if (!user || (user.role ?? "member") !== "admin") {
        return NextResponse.json({ pending: 0 });
      }
      const pending = await pendingApprovalCount(user.company_id, { loginId });
      return NextResponse.json({ pending });
    }
    const pending = await pendingRecordCountAllRealCompanies();
    return NextResponse.json({ pending });
  } catch (err) {
    console.error("[approvals/summary] error:", err);
    return NextResponse.json({ message: "集計に失敗しました。" }, { status: 500 });
  }
}

/** GET など他メソッドは非対応。 */
export function GET() {
  return NextResponse.json({ message: "Method Not Allowed" }, { status: 405 });
}
