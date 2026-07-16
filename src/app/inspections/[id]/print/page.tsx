import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getFactoryScope, isEquipmentSiteVisible } from "@/lib/factoryScope";
import { getEquipment, getRecordWithResults, listResultMediaForRecord } from "@/lib/db";
import { todayJST } from "@/lib/inspection";
import { formatDate, formatDateTime } from "@/lib/format";
import { RECORD_RESULT_LABEL, APPROVAL_STATUS_LABEL, MEDIA_TYPE_LABEL } from "@/lib/types";
import InspectionResultTable from "@/components/InspectionResultTable";
import PrintButton from "@/components/PrintButton";
import DbErrorState from "@/components/DbErrorState";

export const dynamic = "force-dynamic";

export default async function InspectionPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireEntitledSession();
  const { id } = await params;
  const today = todayJST();

  let data, mediaByItemResult;
  try {
    data = await getRecordWithResults(session.companyId, id);
    // 所属工場による表示制限（他工場の設備の記録は notFound）
    if (data) {
      const scope = await getFactoryScope(session.companyId, session.userId);
      if (scope.restricted) {
        const eq = await getEquipment(session.companyId, data.record.equipmentId);
        if (!isEquipmentSiteVisible(scope, eq?.siteId ?? null)) data = null;
      }
    }
    mediaByItemResult = await listResultMediaForRecord(session.companyId, id);
  } catch (e) {
    console.error("[inspection print]", e);
    return (
      <div className="p-6">
        <DbErrorState />
      </div>
    );
  }
  if (!data) notFound();
  const { record, results } = data;

  // 添付メディア一覧（項目番号は結果テーブルの # と揃える）
  const mediaRows = results.flatMap((r, i) =>
    (mediaByItemResult.get(r.id) ?? []).map((m) => ({
      no: i + 1,
      itemLabel: r.itemLabel,
      media: m,
    }))
  );

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      {/* このルートだけ A4 縦で印刷（用紙サイズはルート内で指定）。
          共有テーブル（.print-table）に帳票用の罫線・見出し帯を付与する。 */}
      <style>{`
        @media print { @page { size: A4 portrait; margin: 12mm; } }
        .print-table th, .print-table td { border: 1px solid #94a3b8; }
        .print-table thead tr { background: #f1f5f9; }
      `}</style>

      {/* 画面用ツールバー（印刷時は非表示） */}
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/inspections/${id}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          記録詳細に戻る
        </Link>
        <PrintButton />
      </div>

      {/* 帳票ヘッダ */}
      <div className="mb-4 flex items-end justify-between border-b-2 border-slate-800 pb-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900">点検記録</h1>
          <p className="text-xs text-slate-600">{session.companyName}</p>
        </div>
        <div className="text-right text-xs text-slate-600">
          <div>出力日：{formatDate(today)}</div>
        </div>
      </div>

      {/* 記録情報＋総合判定 */}
      <div className="mb-4 flex items-stretch gap-3">
        <table className="print-table w-full border-collapse text-xs">
          <tbody>
            <tr>
              <th className="w-24 border border-slate-400 bg-slate-100 px-2 py-1.5 text-left font-semibold text-slate-700">
                設備
              </th>
              <td className="border border-slate-300 px-2 py-1.5 text-slate-800">
                {record.equipmentName ?? "—"}
                {record.managementNo ? `（${record.managementNo}）` : ""}
              </td>
              <th className="w-24 border border-slate-400 bg-slate-100 px-2 py-1.5 text-left font-semibold text-slate-700">
                手順書
              </th>
              <td className="border border-slate-300 px-2 py-1.5 text-slate-800">{record.procedureName}</td>
            </tr>
            <tr>
              <th className="border border-slate-400 bg-slate-100 px-2 py-1.5 text-left font-semibold text-slate-700">
                実施日
              </th>
              <td className="border border-slate-300 px-2 py-1.5 text-slate-800">
                {formatDate(record.inspectionDate)}（{formatDateTime(record.createdAt)}）
              </td>
              <th className="border border-slate-400 bg-slate-100 px-2 py-1.5 text-left font-semibold text-slate-700">
                点検者
              </th>
              <td className="border border-slate-300 px-2 py-1.5 text-slate-800">{record.inspector}</td>
            </tr>
            <tr>
              <th className="border border-slate-400 bg-slate-100 px-2 py-1.5 text-left font-semibold text-slate-700">
                NG項目数
              </th>
              <td className="border border-slate-300 px-2 py-1.5 text-slate-800">
                {record.ngCount}件（全{results.length}項目）
              </td>
              <th className="border border-slate-400 bg-slate-100 px-2 py-1.5 text-left font-semibold text-slate-700">
                承認状態
              </th>
              <td className="border border-slate-300 px-2 py-1.5 text-slate-800">
                {APPROVAL_STATUS_LABEL[record.approvalStatus]}
                {record.approverName && `（承認者: ${record.approverName}）`}
              </td>
            </tr>
          </tbody>
        </table>
        <div className="flex w-28 shrink-0 flex-col items-center justify-center border-2 border-slate-800">
          <span className="text-[10px] text-slate-600">総合判定</span>
          <span className="text-3xl font-extrabold text-slate-900">
            {RECORD_RESULT_LABEL[record.result]}
          </span>
        </div>
      </div>

      {/* 項目別結果 */}
      {results.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">項目別の結果がありません。</p>
      ) : (
        <InspectionResultTable
          results={results}
          printMode
          resultMediaByItemResult={mediaByItemResult}
        />
      )}

      {/* 添付メディア一覧（音声・動画等の URL。0件なら節ごと省略） */}
      {mediaRows.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-xs font-semibold text-slate-700">添付メディア一覧</div>
          <table className="print-table w-full border-collapse text-[9px] leading-tight">
            <thead>
              <tr>
                <th className="w-8 px-1.5 py-1 text-left font-semibold text-slate-700">#</th>
                <th className="w-40 px-1.5 py-1 text-left font-semibold text-slate-700">項目名</th>
                <th className="w-12 px-1.5 py-1 text-left font-semibold text-slate-700">種別</th>
                <th className="px-1.5 py-1 text-left font-semibold text-slate-700">URL</th>
              </tr>
            </thead>
            <tbody>
              {mediaRows.map(({ no, itemLabel, media }) => (
                <tr key={media.id}>
                  <td className="px-1.5 py-1 align-top text-slate-400">{no}</td>
                  <td className="px-1.5 py-1 align-top text-slate-800">{itemLabel}</td>
                  <td className="px-1.5 py-1 align-top text-slate-700">
                    {MEDIA_TYPE_LABEL[media.mediaType]}
                  </td>
                  <td className="break-all px-1.5 py-1 align-top text-slate-600">{media.url}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* フッタ：全体メモ */}
      <div className="mt-4 text-xs">
        <div className="mb-1 font-semibold text-slate-700">全体メモ</div>
        <div className="min-h-14 whitespace-pre-wrap border border-slate-400 p-2 text-slate-800">
          {record.notes ?? ""}
        </div>
      </div>

      <p className="no-print mt-4 text-center text-xs text-slate-400">
        ブラウザの印刷ダイアログで「PDFとして保存」を選ぶと PDF 化できます。
        <br />
        ※ 用紙の向きは「縦」、「背景のグラフィック」を ON にすると見やすく印刷できます。
      </p>
    </div>
  );
}
