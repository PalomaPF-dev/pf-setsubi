import Link from "next/link";
import { Wrench } from "lucide-react";
import { JudgmentBadge, ItemTypeBadge, ActionStatusBadge } from "@/components/Badges";
import MediaCell from "@/components/MediaCell";
import type { InspectionItemResult, ActionStatus, ResultMedia } from "@/lib/types";

function valueLabel(r: InspectionItemResult): string {
  if (r.itemType === "numeric" && r.valueNumeric != null) {
    const unit = r.unit ? ` ${r.unit}` : "";
    const range =
      r.minValue != null || r.maxValue != null
        ? `（基準 ${r.minValue ?? "—"} 〜 ${r.maxValue ?? "—"}${unit}）`
        : "";
    return `${r.valueNumeric}${unit}${range}`;
  }
  return "";
}

/** 印刷用: 添付メディアの種別内訳テキスト（例「写真1・音声2」。なければ空文字）。 */
function mediaCountLabel(media: ResultMedia[]): string {
  const count = { photo: 0, audio: 0, video: 0 };
  for (const m of media) count[m.mediaType]++;
  const parts: string[] = [];
  if (count.photo > 0) parts.push(`写真${count.photo}`);
  if (count.audio > 0) parts.push(`音声${count.audio}`);
  if (count.video > 0) parts.push(`動画${count.video}`);
  return parts.join("・");
}

/**
 * 項目別結果のテーブル（記録詳細と印刷ページで共用）。
 * スナップショット列のみで描画するため、手順書が後から変わっても当時のまま表示できる。
 */
export default function InspectionResultTable({
  results,
  printMode = false,
  actionByItemResult,
  resultMediaByItemResult,
}: {
  results: InspectionItemResult[];
  printMode?: boolean;
  /** item_result_id → 処置。渡された場合のみ NG 行に「処置」列を出す（印刷ページは渡さない） */
  actionByItemResult?: Map<string, { id: string; status: ActionStatus }>;
  /** item_result_id → 追加メディア（音声・動画・追加写真）。未指定なら現行どおり写真のみ表示 */
  resultMediaByItemResult?: Map<string, ResultMedia[]>;
}) {
  const showActions = !printMode && actionByItemResult != null;
  return (
    <table className={printMode ? "print-table w-full text-xs" : "w-full min-w-[760px] text-sm"}>
      <thead>
        <tr className={printMode ? "" : "border-b border-slate-200 text-left text-xs text-slate-500"}>
          <th className="px-3 py-2 font-medium">#</th>
          <th className="px-3 py-2 font-medium">点検項目</th>
          <th className="px-3 py-2 font-medium">種別</th>
          <th className="px-3 py-2 font-medium">結果</th>
          <th className="px-3 py-2 font-medium">測定値</th>
          <th className="px-3 py-2 font-medium">コメント</th>
          <th className="px-3 py-2 font-medium">写真・メディア</th>
          {showActions && <th className="px-3 py-2 font-medium">処置</th>}
        </tr>
      </thead>
      <tbody>
        {results.map((r, i) => (
          <tr key={r.id} className={printMode ? "" : "border-b border-slate-100"}>
            <td className="px-3 py-2 text-slate-400">{i + 1}</td>
            <td className="px-3 py-2 font-medium text-slate-800">{r.itemLabel}</td>
            <td className="px-3 py-2">
              {printMode ? (
                <span>{r.itemType === "ok_ng" ? "判定" : r.itemType === "numeric" ? "数値" : r.itemType === "photo" ? "写真" : "テキスト"}</span>
              ) : (
                <ItemTypeBadge type={r.itemType} />
              )}
            </td>
            <td className="px-3 py-2">
              {printMode ? (
                <span className={r.judgment === "ng" ? "font-bold" : ""}>
                  {r.judgment === "ok" ? "OK" : r.judgment === "ng" ? "NG" : "—"}
                </span>
              ) : (
                <JudgmentBadge judgment={r.judgment} />
              )}
              {r.autoJudgment != null && r.judgment !== r.autoJudgment && (
                <span className={printMode ? "ml-1" : "ml-1 text-[10px] text-amber-600"}>
                  （自動判定 {r.autoJudgment === "ok" ? "OK" : "NG"} を上書き）
                </span>
              )}
            </td>
            <td className="px-3 py-2 text-slate-700">{valueLabel(r)}</td>
            <td className="px-3 py-2 whitespace-pre-wrap text-slate-600">{r.valueText ?? ""}</td>
            <td className="px-3 py-2">
              {(() => {
                const media = resultMediaByItemResult?.get(r.id) ?? [];
                if (!r.photoUrl && media.length === 0) {
                  return <span className="text-slate-300">—</span>;
                }
                if (printMode) {
                  // 印刷: 写真は現行どおり、追加メディアは件数テキストのみ（リンクなし）
                  return (
                    <div>
                      {r.photoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.photoUrl} alt={r.itemLabel} className="h-20 w-20 object-cover" />
                      )}
                      {media.length > 0 && <div>{mediaCountLabel(media)}</div>}
                    </div>
                  );
                }
                return (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {r.photoUrl && (
                      <a href={r.photoUrl} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.photoUrl}
                          alt={r.itemLabel}
                          className="h-14 w-14 rounded-md border border-slate-200 object-cover hover:opacity-80"
                        />
                      </a>
                    )}
                    {media.length > 0 && <MediaCell media={media} />}
                  </div>
                );
              })()}
            </td>
            {showActions && (
              <td className="px-3 py-2">
                {r.judgment === "ng" ? (
                  (() => {
                    const action = actionByItemResult!.get(r.id);
                    return action ? (
                      <Link href={`/actions#a-${action.id}`} className="inline-flex">
                        <ActionStatusBadge status={action.status} />
                      </Link>
                    ) : (
                      <Link
                        href={`/actions/new?item=${r.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 hover:text-orange-800"
                      >
                        <Wrench className="h-3.5 w-3.5" />
                        処置を登録
                      </Link>
                    );
                  })()
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * 項目別結果のカード表示（モバイル用）。
 * 記録詳細ページで md 未満のときにテーブルの代わりに表示する。
 */
export function InspectionResultCards({
  results,
  actionByItemResult,
  resultMediaByItemResult,
}: {
  results: InspectionItemResult[];
  actionByItemResult?: Map<string, { id: string; status: ActionStatus }>;
  resultMediaByItemResult?: Map<string, ResultMedia[]>;
}) {
  return (
    <ul className="divide-y divide-slate-100">
      {results.map((r, i) => {
        const media = resultMediaByItemResult?.get(r.id) ?? [];
        const value = valueLabel(r);
        const action = actionByItemResult?.get(r.id);
        return (
          <li key={r.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs text-slate-400">#{i + 1}</div>
                <div className="font-medium text-slate-800">{r.itemLabel}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <JudgmentBadge judgment={r.judgment} />
                <ItemTypeBadge type={r.itemType} />
              </div>
            </div>
            {r.autoJudgment != null && r.judgment !== r.autoJudgment && (
              <p className="mt-1 text-[10px] text-amber-600">
                （自動判定 {r.autoJudgment === "ok" ? "OK" : "NG"} を上書き）
              </p>
            )}
            {value && (
              <div className="mt-2 text-sm text-slate-700">
                <span className="mr-1.5 text-xs text-slate-400">測定値</span>
                {value}
              </div>
            )}
            {r.valueText && (
              <div className="mt-2 text-sm text-slate-600">
                <span className="mr-1.5 text-xs text-slate-400">コメント</span>
                <span className="whitespace-pre-wrap">{r.valueText}</span>
              </div>
            )}
            {(r.photoUrl || media.length > 0) && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {r.photoUrl && (
                  <a href={r.photoUrl} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={r.photoUrl}
                      alt={r.itemLabel}
                      className="h-16 w-16 rounded-md border border-slate-200 object-cover"
                    />
                  </a>
                )}
                {media.length > 0 && <MediaCell media={media} />}
              </div>
            )}
            {actionByItemResult != null && r.judgment === "ng" && (
              <div className="mt-3">
                {action ? (
                  <Link href={`/actions#a-${action.id}`} className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                    処置: <ActionStatusBadge status={action.status} />
                  </Link>
                ) : (
                  <Link
                    href={`/actions/new?item=${r.id}`}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 text-sm font-medium text-orange-700 active:bg-orange-100"
                  >
                    <Wrench className="h-4 w-4" />
                    処置を登録
                  </Link>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
