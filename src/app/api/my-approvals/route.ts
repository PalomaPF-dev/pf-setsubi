import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/session";
import { getUserApprovalRouting } from "@/lib/authDb";
import { pendingApprovalCount } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ログイン中ユーザー向けの「自分宛て承認待ち件数」API（ヘッダーバッジ用）。
 *
 * GET /api/my-approvals → { pending: number }
 * - 未ログイン: 401（バッジは何も表示しない）
 * - 一般ユーザー（member）: 常に { pending: 0 }
 * - 管理者: 承認ルーティングを適用した承認待ち件数
 *   （提出者の指名承認者 users.approver_login_id が NULL＝指名なし、
 *    または自分の login_id に一致する記録のみ。ダッシュボード・点検履歴と同じ絞り込み）
 */
export async function GET() {
  const user = await getOptionalSession();
  if (!user) {
    return NextResponse.json({ pending: 0 }, { status: 401 });
  }
  try {
    // role は DB から都度取得（既存セッションにも即時反映、他の管理系APIと同じ方式）
    const routing = await getUserApprovalRouting(user.id);
    if (routing?.role !== "admin") {
      return NextResponse.json({ pending: 0 });
    }
    const pending = await pendingApprovalCount(user.companyId, {
      loginId: routing.loginId,
    });
    return NextResponse.json({ pending });
  } catch (err) {
    console.error("[my-approvals] error:", err);
    return NextResponse.json({ pending: 0 }, { status: 500 });
  }
}
