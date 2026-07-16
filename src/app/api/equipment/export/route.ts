import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getCompanyEntitlement } from "@/lib/entitlement";
import { getFactoryScope, scopedSiteId } from "@/lib/factoryScope";
import { listEquipment, listCustomFieldDefs } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { ledgerHeaders, ledgerCells } from "@/lib/ledger";
import { todayJST } from "@/lib/inspection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 設備台帳を CSV でダウンロード（カスタム項目列も含む）。検索語 q があれば同じ条件で絞り込む。 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId) {
    return new Response("unauthorized", { status: 401 });
  }
  // 利用権（契約 or トライアル）が無ければ拒否（課金ゲートのサーバー側実施・失敗時は許可）
  try {
    const ent = await getCompanyEntitlement(session.user.companyId);
    if (!ent.active) return new Response("subscription required", { status: 402 });
  } catch (e) {
    console.error("[export] entitlement check failed, allowing:", e);
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() || undefined;
  const site = url.searchParams.get("site")?.trim() || undefined;
  const area = url.searchParams.get("area")?.trim() || undefined;

  let items, defs;
  try {
    // 一覧と同じ工場/職場フィルタ＋所属工場による表示制限（制限ユーザーは自工場に強制）
    const scope = await getFactoryScope(session.user.companyId, session.user.id);
    [items, defs] = await Promise.all([
      listEquipment(session.user.companyId, q, {
        siteId: scopedSiteId(scope, site),
        areaId: area,
      }),
      listCustomFieldDefs(session.user.companyId),
    ]);
  } catch (e) {
    console.error("[csv export]", e);
    return new Response("database error", { status: 503 });
  }

  const today = todayJST();
  const rows = items.map((e) => ledgerCells(e, defs, today));
  const csv = toCsv(ledgerHeaders(defs), rows);

  const fnameJa = `設備台帳_${today}.csv`;
  const fnameAscii = `equipment_ledger_${today}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fnameAscii}"; filename*=UTF-8''${encodeURIComponent(fnameJa)}`,
      "Cache-Control": "no-store",
    },
  });
}
