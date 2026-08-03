import Link from "next/link";
import { FileDown, ClipboardCheck, SlidersHorizontal, ChevronDown } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getUserApprovalRouting } from "@/lib/authDb";
import { getFactoryScope, scopedSiteId } from "@/lib/factoryScope";
import {
  listRecords,
  listEquipment,
  listProcedures,
  unassignedPendingApprovalCount,
  type RecordFilters,
} from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import type { ApprovalStatus } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import { ResultBadge, ApprovalStatusBadge } from "@/components/Badges";
import DbErrorState from "@/components/DbErrorState";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function asUuid(v?: string): string | undefined {
  return v && UUID_RE.test(v.trim()) ? v.trim() : undefined;
}
function asDate(v?: string): string | undefined {
  return v && DATE_RE.test(v.trim()) ? v.trim() : undefined;
}

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

export default async function InspectionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    equipment?: string;
    procedure?: string;
    result?: string;
    approval?: string;
    from?: string;
    to?: string;
    unassigned?: string;
  }>;
}) {
  const session = await requireEntitledSession();
  const sp = await searchParams;

  const approvalStatus: ApprovalStatus | undefined =
    sp.approval === "pending" || sp.approval === "approved" || sp.approval === "returned"
      ? sp.approval
      : undefined;
  const filters: RecordFilters = {
    equipmentId: asUuid(sp.equipment),
    procedureId: asUuid(sp.procedure),
    result: sp.result === "pass" || sp.result === "fail" ? sp.result : undefined,
    approvalStatus,
    from: asDate(sp.from),
    to: asDate(sp.to),
  };
  const hasFilter = Boolean(
    filters.equipmentId ||
      filters.procedureId ||
      filters.result ||
      filters.approvalStatus ||
      filters.from ||
      filters.to
  );

  let records, equipmentList, procedures;
  let unassignedPending = 0;
  const showUnassigned = sp.unassigned === "1";
  try {
    // 所属工場による表示制限（制限ユーザーは自工場の記録・設備のみ）
    const scope = await getFactoryScope(session.companyId, session.userId);
    const scopeSiteId = scopedSiteId(scope);
    filters.siteId = scopeSiteId;
    // 承認ルーティング: 管理者には「自分が承認の番」の承認待ちだけ表示する。
    // ?unassigned=1 のときは担当未指定（承認者が解決できない）の承認待ちだけを表示
    const routing = await getUserApprovalRouting(session.userId);
    const isAdmin = routing?.role === "admin";
    if (isAdmin) {
      filters.approvalScope = { loginId: routing.loginId, unassignedOnly: showUnassigned };
    }
    [records, equipmentList, procedures, unassignedPending] = await Promise.all([
      listRecords(session.companyId, filters),
      listEquipment(session.companyId, undefined, { siteId: scopeSiteId }),
      listProcedures(session.companyId, { includeArchived: true }),
      // 誰の番にもならない承認待ちが埋もれないよう、承認待ちビューでは件数を出す
      isAdmin && approvalStatus === "pending"
        ? unassignedPendingApprovalCount(session.companyId)
        : Promise.resolve(0),
    ]);
  } catch (e) {
    console.error("[inspections list]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="点検履歴" />
        <DbErrorState />
      </div>
    );
  }

  // CSV出力へ現在のフィルタをそのまま引き継ぐ
  const exportParams = new URLSearchParams();
  if (filters.equipmentId) exportParams.set("equipment", filters.equipmentId);
  if (filters.procedureId) exportParams.set("procedure", filters.procedureId);
  if (filters.result) exportParams.set("result", filters.result);
  if (filters.approvalStatus) exportParams.set("approval", filters.approvalStatus);
  if (filters.from) exportParams.set("from", filters.from);
  if (filters.to) exportParams.set("to", filters.to);
  const exportQs = exportParams.toString();

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="点検履歴"
        description="実施済みの点検記録を横断的に確認・CSV出力"
        action={
          records.length > 0 && (
            <a
              href={`/api/inspections/export${exportQs ? `?${exportQs}` : ""}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <FileDown className="h-4 w-4" />
              CSV出力
            </a>
          )
        }
      />

      {/* 承認ルーティングの注意書き。承認待ちは「自分が承認の番」だけに絞られるため、
          誰の番にもならない（担当未指定の）記録が埋もれないよう件数と導線を出す */}
      {approvalStatus === "pending" && showUnassigned && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          担当未指定の承認待ちを表示しています（提出者に承認者が設定されていない記録）。
          <Link href="/inspections?approval=pending" className="ml-2 font-medium underline">
            自分宛てに戻す
          </Link>
        </div>
      )}
      {approvalStatus === "pending" && !showUnassigned && unassignedPending > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          担当未指定の承認待ちが {unassignedPending} 件あります（提出者に承認者が未設定のため、誰の番にもなっていません）。
          <Link
            href="/inspections?approval=pending&unassigned=1"
            className="ml-2 font-medium underline"
          >
            表示する
          </Link>
        </div>
      )}

      {/* フィルタ（GET フォーム）。モバイルではアコーディオンに畳んで記録リストを先に見せる */}
      <details className="group mb-4 rounded-2xl border border-slate-200 bg-white sm:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-sm font-medium text-slate-700 [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal className="h-4 w-4 text-slate-400" />
          絞り込み
          {hasFilter && (
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
              適用中
            </span>
          )}
          <ChevronDown className="ml-auto h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-slate-100 p-3">
          <FilterForm
            filters={filters}
            hasFilter={hasFilter}
            equipmentList={equipmentList}
            procedures={procedures}
          />
        </div>
      </details>
      <div className="mb-4 hidden rounded-2xl border border-slate-200 bg-white p-3 sm:block sm:p-4">
        <FilterForm
          filters={filters}
          hasFilter={hasFilter}
          equipmentList={equipmentList}
          procedures={procedures}
        />
      </div>

      {records.length === 0 ? (
        <EmptyState hasFilter={hasFilter} />
      ) : (
        <>
          {/* PC：テーブル */}
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white wide:block">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">実施日</th>
                  <th className="px-4 py-3 font-medium">設備</th>
                  <th className="px-4 py-3 font-medium">手順書</th>
                  <th className="px-4 py-3 font-medium">点検者</th>
                  <th className="px-4 py-3 font-medium">結果</th>
                  <th className="px-4 py-3 font-medium">承認</th>
                  <th className="px-4 py-3 font-medium">NG項目数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/inspections/${r.id}`} className="font-medium text-slate-800 hover:underline">
                        {formatDate(r.inspectionDate)}
                      </Link>
                      <div className="text-xs text-slate-400">{formatDateTime(r.createdAt)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/inspections/${r.id}`} className="font-medium text-slate-800 hover:underline">
                        {r.equipmentName ?? "—"}
                      </Link>
                      <div className="font-mono text-xs text-slate-400">{r.managementNo ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.procedureName}</td>
                    <td className="px-4 py-3 text-slate-600">{r.inspector}</td>
                    <td className="px-4 py-3">
                      <ResultBadge result={r.result} />
                    </td>
                    <td className="px-4 py-3">
                      <ApprovalStatusBadge status={r.approvalStatus} />
                    </td>
                    <td className="px-4 py-3">
                      {r.ngCount > 0 ? (
                        <span className="font-semibold text-red-600">{r.ngCount}件</span>
                      ) : (
                        <span className="text-slate-400">0件</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* モバイル：カード */}
          <ul className="flex flex-col gap-2.5 wide:hidden">
            {records.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/inspections/${r.id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-3.5 active:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-800">{r.equipmentName ?? "—"}</div>
                      <div className="truncate text-xs text-slate-400">
                        {r.managementNo ?? "—"} ・ {r.procedureName}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <ResultBadge result={r.result} />
                      <ApprovalStatusBadge status={r.approvalStatus} />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {formatDate(r.inspectionDate)} ・ {r.inspector}
                    </span>
                    {r.ngCount > 0 && (
                      <span className="font-semibold text-red-600">NG {r.ngCount}件</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function FilterForm({
  filters,
  hasFilter,
  equipmentList,
  procedures,
}: {
  filters: RecordFilters;
  hasFilter: boolean;
  equipmentList: Awaited<ReturnType<typeof listEquipment>>;
  procedures: Awaited<ReturnType<typeof listProcedures>>;
}) {
  return (
    <form>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">設備</span>
          <select name="equipment" defaultValue={filters.equipmentId ?? ""} className={inputCls}>
            <option value="">すべて</option>
            {equipmentList.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}（{e.managementNo}）
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">手順書</span>
          <select name="procedure" defaultValue={filters.procedureId ?? ""} className={inputCls}>
            <option value="">すべて</option>
            {procedures.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.archived ? "（アーカイブ済み）" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">結果</span>
          <select name="result" defaultValue={filters.result ?? ""} className={inputCls}>
            <option value="">すべて</option>
            <option value="pass">OK</option>
            <option value="fail">NG</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">承認状態</span>
          <select name="approval" defaultValue={filters.approvalStatus ?? ""} className={inputCls}>
            <option value="">すべて</option>
            <option value="pending">承認待ち</option>
            <option value="approved">承認済み</option>
            <option value="returned">差し戻し</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">期間（開始）</span>
          <input type="date" name="from" defaultValue={filters.from ?? ""} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">期間（終了）</span>
          <input type="date" name="to" defaultValue={filters.to ?? ""} className={inputCls} />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-800"
        >
          絞り込む
        </button>
        {hasFilter && (
          <Link href="/inspections" className="text-sm text-slate-500 hover:text-slate-700">
            クリア
          </Link>
        )}
      </div>
    </form>
  );
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
      <ClipboardCheck className="mx-auto mb-3 h-10 w-10 text-slate-300" />
      <p className="text-sm text-slate-500">
        {hasFilter
          ? "条件に一致する点検記録が見つかりませんでした。"
          : "まだ点検記録がありません。「点検・スキャン」から点検を実施すると、ここに履歴が表示されます。"}
      </p>
      {!hasFilter && (
        <Link
          href="/scan"
          className="mt-4 inline-flex h-11 items-center gap-1.5 rounded-lg bg-orange-700 px-4 text-sm font-semibold text-white hover:bg-orange-800"
        >
          点検をはじめる
        </Link>
      )}
    </div>
  );
}
