import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getCompanyEntitlement } from "@/lib/entitlement";
import { getFactoryScope, isEquipmentSiteVisible } from "@/lib/factoryScope";
import { getEquipmentByManagementNo } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 管理番号で設備を検索（手入力 / QR の代替）。
 * 完全一致なら id を返す。無ければ id:null（呼び出し側で台帳検索にフォールバック）。
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const ent = await getCompanyEntitlement(session.user.companyId);
    if (!ent.active) return Response.json({ error: "subscription required" }, { status: 402 });
  } catch (e) {
    console.error("[lookup] entitlement check failed, allowing:", e);
  }

  const managementNo = new URL(req.url).searchParams.get("managementNo")?.trim() ?? "";
  if (!managementNo) return Response.json({ id: null });

  try {
    let eq = await getEquipmentByManagementNo(session.user.companyId, managementNo);
    // 所属工場による表示制限（他工場の設備は「見つからない」扱いで台帳検索へフォールバック）
    if (eq) {
      const scope = await getFactoryScope(session.user.companyId, session.user.id);
      if (!isEquipmentSiteVisible(scope, eq.siteId)) eq = null;
    }
    return Response.json(
      { id: eq?.id ?? null },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("[equipment lookup]", e);
    return Response.json({ error: "database error" }, { status: 503 });
  }
}
