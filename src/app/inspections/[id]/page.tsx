import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer, Trash2 } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getFactoryScope, isEquipmentSiteVisible } from "@/lib/factoryScope";
import { getEquipment, getRecordWithResults, listActionsForRecord, listResultMediaForRecord } from "@/lib/db";
import type { ActionStatus, ResultMedia } from "@/lib/types";
import { deleteInspectionRecordAction } from "@/lib/actions";
import { formatDate, formatDateTime } from "@/lib/format";
import { ResultBadge, ApprovalStatusBadge } from "@/components/Badges";
import InspectionResultTable, { InspectionResultCards } from "@/components/InspectionResultTable";
import InspectionApprovalPanel from "@/components/InspectionApprovalPanel";
import ConfirmForm from "@/components/ConfirmForm";
import DbErrorState from "@/components/DbErrorState";

export const dynamic = "force-dynamic";

export default async function InspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireEntitledSession();
  const { id } = await params;

  let data;
  let actionByItemResult: Map<string, { id: string; status: ActionStatus }>;
  let resultMediaByItemResult: Map<string, ResultMedia[]>;
  try {
    const [d, actions, media] = await Promise.all([
      getRecordWithResults(session.companyId, id),
      listActionsForRecord(session.companyId, id),
      listResultMediaForRecord(session.companyId, id),
    ]);
    data = d;
    // 所属工場による表示制限（他工場の設備の記録は notFound）
    if (data) {
      const scope = await getFactoryScope(session.companyId, session.userId);
      if (scope.restricted) {
        const eq = await getEquipment(session.companyId, data.record.equipmentId);
        if (!isEquipmentSiteVisible(scope, eq?.siteId ?? null)) data = null;
      }
    }
    resultMediaByItemResult = media;
    actionByItemResult = new Map(
      actions
        .filter((a) => a.itemResultId)
        .map((a) => [a.itemResultId!, { id: a.id, status: a.status }])
    );
  } catch (e) {
    console.error("[inspection detail]", e);
    return (
      <div className="p-4 sm:p-6">
        <DbErrorState />
      </div>
    );
  }
  if (!data) notFound();
  const { record, results } = data;

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <Link
        href="/inspections"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        点検履歴に戻る
      </Link>

      {/* ヘッダ */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-slate-800 sm:text-2xl">{record.procedureName}</h1>
            <ResultBadge result={record.result} />
            <ApprovalStatusBadge status={record.approvalStatus} />
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {formatDate(record.inspectionDate)} ・ {record.inspector}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/inspections/${id}/print`}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            PDF印刷
          </Link>
          <ConfirmForm
            action={deleteInspectionRecordAction.bind(null, id, record.equipmentId)}
            message="この点検記録を削除しますか？項目別の結果と添付された点検写真も削除されます。元に戻せません。"
          >
            <button className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-sm font-medium text-red-600 hover:bg-red-50">
              <Trash2 className="h-4 w-4" />
              削除
            </button>
          </ConfirmForm>
        </div>
      </div>

      {/* 承認ワークフロー */}
      <InspectionApprovalPanel
        recordId={id}
        status={record.approvalStatus}
        approverName={record.approverName}
        approvedAt={record.approvedAt}
        reviewComment={record.reviewComment}
        equipmentId={record.equipmentId}
      />

      {/* 記録情報カード */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-bold text-slate-700">点検情報</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-400">設備</dt>
            <dd className="mt-0.5">
              <Link
                href={`/equipment/${record.equipmentId}`}
                className="font-medium text-orange-700 hover:underline"
              >
                {record.equipmentName ?? "—"}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">管理番号</dt>
            <dd className="mt-0.5 font-mono text-slate-700">{record.managementNo ?? "—"}</dd>
          </div>
          <Info label="手順書" value={record.procedureName} />
          <Info label="実施日" value={formatDate(record.inspectionDate)} />
          <Info label="実施時刻" value={formatDateTime(record.createdAt)} />
          <Info label="点検者" value={record.inspector} />
          <div>
            <dt className="text-xs text-slate-400">総合結果</dt>
            <dd className="mt-0.5 flex items-center gap-2">
              <ResultBadge result={record.result} />
              {record.ngCount > 0 ? (
                <span className="text-xs font-semibold text-red-600">NG {record.ngCount}件</span>
              ) : (
                <span className="text-xs text-slate-400">NG 0件</span>
              )}
            </dd>
          </div>
        </dl>
        {record.notes && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <div className="text-xs text-slate-400">全体メモ</div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{record.notes}</p>
          </div>
        )}
      </div>

      {/* 項目別結果 */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
          項目別結果（{results.length}件）
        </div>
        {results.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">項目別の結果がありません。</p>
        ) : (
          <>
            {/* PC：テーブル */}
            <div className="hidden overflow-x-auto md:block">
              <InspectionResultTable
                results={results}
                actionByItemResult={actionByItemResult}
                resultMediaByItemResult={resultMediaByItemResult}
              />
            </div>
            {/* モバイル：カード（1項目 = 1カード） */}
            <div className="md:hidden">
              <InspectionResultCards
                results={results}
                actionByItemResult={actionByItemResult}
                resultMediaByItemResult={resultMediaByItemResult}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-slate-700">{value || "—"}</dd>
    </div>
  );
}
