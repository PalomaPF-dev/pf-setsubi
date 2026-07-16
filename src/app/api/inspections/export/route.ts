import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getCompanyEntitlement } from "@/lib/entitlement";
import { getFactoryScope, scopedSiteId } from "@/lib/factoryScope";
import {
  listRecords,
  listItemResultsForRecords,
  listResultMediaForRecords,
  type RecordFilters,
} from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { RECORD_CSV_HEADERS, recordCsvCells } from "@/lib/ledger";
import { todayJST } from "@/lib/inspection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function asUuid(v: string | null): string | undefined {
  return v && UUID_RE.test(v.trim()) ? v.trim() : undefined;
}
function asDate(v: string | null): string | undefined {
  return v && DATE_RE.test(v.trim()) ? v.trim() : undefined;
}

/** 点検記録を CSV でダウンロード（1行 = 1項目結果のロング形式）。一覧と同じフィルタで絞り込む。 */
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
    console.error("[inspections export] entitlement check failed, allowing:", e);
  }

  const url = new URL(req.url);
  const resultParam = url.searchParams.get("result");
  const approvalParam = url.searchParams.get("approval");
  const filters: RecordFilters = {
    equipmentId: asUuid(url.searchParams.get("equipment")),
    procedureId: asUuid(url.searchParams.get("procedure")),
    result: resultParam === "pass" || resultParam === "fail" ? resultParam : undefined,
    approvalStatus:
      approvalParam === "pending" || approvalParam === "approved" || approvalParam === "returned"
        ? approvalParam
        : undefined,
    from: asDate(url.searchParams.get("from")),
    to: asDate(url.searchParams.get("to")),
    siteId: asUuid(url.searchParams.get("site")),
    areaId: asUuid(url.searchParams.get("area")),
    limit: 10000, // エクスポートは実質全件（一覧UIの既定200とは別）
  };

  let rows;
  try {
    // 所属工場による表示制限（制限ユーザーは工場を自工場に強制）
    const scope = await getFactoryScope(session.user.companyId, session.user.id);
    filters.siteId = scopedSiteId(scope, filters.siteId);
    const records = await listRecords(session.user.companyId, filters);
    const recordIds = records.map((r) => r.id);
    const [resultsByRecord, mediaByItemResult] = await Promise.all([
      listItemResultsForRecords(session.user.companyId, recordIds),
      listResultMediaForRecords(session.user.companyId, recordIds),
    ]);
    rows = records.flatMap((record) =>
      (resultsByRecord.get(record.id) ?? []).map((result) =>
        recordCsvCells(
          record,
          result,
          (mediaByItemResult.get(result.id) ?? []).map((m) => m.url).join("|")
        )
      )
    );
  } catch (e) {
    console.error("[inspections export]", e);
    return new Response("database error", { status: 503 });
  }

  const csv = toCsv([...RECORD_CSV_HEADERS], rows);

  const ymd = todayJST().replace(/-/g, "");
  const fnameJa = `点検記録_${ymd}.csv`;
  const fnameAscii = `inspection_records_${ymd}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fnameAscii}"; filename*=UTF-8''${encodeURIComponent(fnameJa)}`,
      "Cache-Control": "no-store",
    },
  });
}
