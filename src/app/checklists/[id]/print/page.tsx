import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { ArrowLeft } from "lucide-react";
import { requireAdminPage } from "@/lib/session";
import { getFactoryScope, isEquipmentSiteVisible } from "@/lib/factoryScope";
import {
  getProcedure,
  listInspectionItems,
  listReferenceMediaForProcedure,
  listAssignmentsForProcedure,
} from "@/lib/db";
import { todayJST } from "@/lib/inspection";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  ITEM_TYPE_LABEL,
  PHOTO_MODE_LABEL,
  MEDIA_TYPE_LABEL,
  type InspectionItem,
  type ItemReferenceMedia,
  type MediaType,
} from "@/lib/types";
import PrintButton from "@/components/PrintButton";
import DbErrorState from "@/components/DbErrorState";

export const dynamic = "force-dynamic";

/** 数値項目の基準表示（ウィザードの rangeLabel と同ロジック。numeric 以外は —）。 */
function rangeLabel(item: InspectionItem): string {
  if (item.itemType !== "numeric") return "—";
  const unit = item.unit ? ` ${item.unit}` : "";
  if (item.minValue != null && item.maxValue != null)
    return `${item.minValue} 〜 ${item.maxValue}${unit}`;
  if (item.minValue != null) return `${item.minValue} 以上${unit}`;
  if (item.maxValue != null) return `${item.maxValue} 以下${unit}`;
  return "—";
}

/** 見本メディアの件数表記（例: 「写真2・音声1」。0件は —）。 */
function referenceSummary(list: ItemReferenceMedia[]): string {
  const counts: Record<MediaType, number> = { photo: 0, audio: 0, video: 0 };
  for (const m of list) counts[m.mediaType] += 1;
  const parts = (Object.keys(counts) as MediaType[])
    .filter((t) => counts[t] > 0)
    .map((t) => `${MEDIA_TYPE_LABEL[t]}${counts[t]}`);
  return parts.length > 0 ? parts.join("・") : "—";
}

export default async function ChecklistPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdminPage();
  const { id } = await params;
  const today = todayJST();

  let procedure, items, refMediaByItem, assignments;
  try {
    procedure = await getProcedure(session.companyId, id);
    if (procedure) {
      let scope;
      [items, refMediaByItem, assignments, scope] = await Promise.all([
        listInspectionItems(session.companyId, id),
        listReferenceMediaForProcedure(session.companyId, id),
        listAssignmentsForProcedure(session.companyId, id),
        getFactoryScope(session.companyId, session.userId),
      ]);
      // 所属工場による表示制限（割当設備の一覧は自工場の設備のみ表示）
      if (scope.restricted) {
        assignments = assignments.filter((a) =>
          isEquipmentSiteVisible(scope, a.equipmentSiteId ?? null)
        );
      }
    }
  } catch (e) {
    console.error("[checklist print]", e);
    return (
      <div className="p-6">
        <DbErrorState />
      </div>
    );
  }
  if (!procedure || !items || !refMediaByItem || !assignments) notFound();

  // オンラインページへの QR（この端末でアクセスしたオリジンを使って絶対URLを生成）
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${h.get("host")}`;
  const qrDataUrl = await QRCode.toDataURL(`${origin}/checklists/${id}`, {
    width: 220,
    margin: 1,
  });

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
          href={`/checklists/${id}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          手順書に戻る
        </Link>
        <PrintButton />
      </div>

      {/* 帳票ヘッダ */}
      <div className="mb-4 flex items-end justify-between border-b-2 border-slate-800 pb-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900">点検手順書</h1>
          <p className="text-xs text-slate-600">{session.companyName}</p>
        </div>
        <div className="text-right text-xs text-slate-600">
          <div>出力日：{formatDate(today)}</div>
        </div>
      </div>

      {/* 表紙情報＋オンラインページQR */}
      <div className="mb-4 flex items-stretch gap-3">
        <table className="print-table w-full border-collapse text-xs">
          <tbody>
            <tr>
              <th className="w-24 border border-slate-400 bg-slate-100 px-2 py-1.5 text-left font-semibold text-slate-700">
                手順書名
              </th>
              <td className="border border-slate-300 px-2 py-1.5 font-semibold text-slate-900">
                {procedure.name}
              </td>
            </tr>
            <tr>
              <th className="border border-slate-400 bg-slate-100 px-2 py-1.5 text-left font-semibold text-slate-700">
                説明
              </th>
              <td className="whitespace-pre-wrap border border-slate-300 px-2 py-1.5 text-slate-800">
                {procedure.description ?? "—"}
              </td>
            </tr>
            <tr>
              <th className="border border-slate-400 bg-slate-100 px-2 py-1.5 text-left font-semibold text-slate-700">
                項目数
              </th>
              <td className="border border-slate-300 px-2 py-1.5 text-slate-800">
                {items.length}項目
              </td>
            </tr>
            <tr>
              <th className="border border-slate-400 bg-slate-100 px-2 py-1.5 text-left font-semibold text-slate-700">
                対象設備数
              </th>
              <td className="border border-slate-300 px-2 py-1.5 text-slate-800">
                {assignments.length}台
              </td>
            </tr>
            <tr>
              <th className="border border-slate-400 bg-slate-100 px-2 py-1.5 text-left font-semibold text-slate-700">
                最終更新
              </th>
              <td className="border border-slate-300 px-2 py-1.5 text-slate-800">
                {formatDateTime(procedure.updatedAt)}
              </td>
            </tr>
          </tbody>
        </table>
        <div className="flex w-28 shrink-0 flex-col items-center justify-center border-2 border-slate-800 p-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="オンラインページQRコード" className="h-20 w-20" />
          <span className="mt-1 text-center text-[9px] leading-tight text-slate-600">
            オンラインで開く
          </span>
        </div>
      </div>

      {/* 点検部位マップ（図面＋番号ピン。番号は項目一覧の # と一致） */}
      {procedure.diagramUrl && items.some((it) => it.mapX != null && it.mapY != null) && (
        <div className="mb-4 break-inside-avoid">
          <h2 className="mb-1.5 text-sm font-bold text-slate-800">点検部位マップ</h2>
          <div className="relative inline-block max-w-full border border-slate-400">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={procedure.diagramUrl}
              alt="点検部位マップ"
              className="block h-auto w-full max-w-2xl"
            />
            {items.map((item, i) =>
              item.mapX != null && item.mapY != null ? (
                <span
                  key={item.id}
                  className="absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-rose-500 text-[10px] font-bold text-white"
                  style={{ left: `${item.mapX}%`, top: `${item.mapY}%` }}
                >
                  {i + 1}
                </span>
              ) : null
            )}
          </div>
        </div>
      )}

      {/* 点検項目一覧 */}
      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">点検項目がありません。</p>
      ) : (
        <table className="print-table w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="w-8 px-2 py-1.5 text-left font-semibold text-slate-700">#</th>
              <th className="w-24 px-2 py-1.5 text-left font-semibold text-slate-700">箇所写真</th>
              <th className="px-2 py-1.5 text-left font-semibold text-slate-700">点検項目・点検方法</th>
              <th className="w-20 px-2 py-1.5 text-left font-semibold text-slate-700">タイプ</th>
              <th className="w-28 px-2 py-1.5 text-left font-semibold text-slate-700">基準値</th>
              <th className="w-14 px-2 py-1.5 text-left font-semibold text-slate-700">写真</th>
              <th className="w-24 px-2 py-1.5 text-left font-semibold text-slate-700">見本</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id}>
                <td className="px-2 py-1.5 align-top text-slate-400">{i + 1}</td>
                <td className="px-2 py-1.5 align-top">
                  {item.spotPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.spotPhotoUrl}
                      alt={`${item.label} の点検箇所`}
                      className="h-20 w-20 object-cover"
                    />
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-2 py-1.5 align-top">
                  <div className="font-medium text-slate-800">{item.label}</div>
                  {item.instruction && (
                    <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-600">
                      {item.instruction}
                    </div>
                  )}
                </td>
                <td className="px-2 py-1.5 align-top text-slate-700">
                  {ITEM_TYPE_LABEL[item.itemType]}
                </td>
                <td className="px-2 py-1.5 align-top text-slate-700">{rangeLabel(item)}</td>
                <td className="px-2 py-1.5 align-top text-slate-700">
                  {PHOTO_MODE_LABEL[item.photoMode]}
                </td>
                <td className="px-2 py-1.5 align-top text-slate-700">
                  {referenceSummary(refMediaByItem.get(item.id) ?? [])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="no-print mt-4 text-center text-xs text-slate-400">
        ブラウザの印刷ダイアログで「PDFとして保存」を選ぶと PDF 化できます。
        <br />
        ※ 用紙の向きは「縦」、「背景のグラフィック」を ON にすると見やすく印刷できます。
      </p>
    </div>
  );
}
