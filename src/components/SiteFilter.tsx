"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Factory } from "lucide-react";
import type { Site } from "@/lib/types";

const inputCls =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

/**
 * 工場/職場の絞り込みフィルタ（GET フォーム）。
 * 職場は選択中の工場配下のみ表示（連動）。select 変更で即 submit する。
 * 既存の GET パラメータ（検索語やビュー切替など）は extraParams の hidden で維持。
 *
 * lockedSiteName を渡すと工場は「所属: ◯◯工場」の固定表示になる
 * （所属工場による表示制限ユーザー用。sites は自工場のみ渡す想定。
 *  サーバー側でも常に自工場へ強制されるため、UI はあくまで案内表示）。
 */
export default function SiteFilter({
  sites,
  siteId,
  areaId,
  basePath,
  extraParams = {},
  lockedSiteName,
}: {
  sites: Site[]; // listSitesWithAreas の結果（areas 込み）
  siteId?: string;
  areaId?: string;
  basePath: string; // クリアリンク先（例 "/equipment"）
  extraParams?: Record<string, string>;
  lockedSiteName?: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const locked = Boolean(lockedSiteName);
  const [currentSite, setCurrentSite] = useState(
    siteId ?? (locked ? sites[0]?.id ?? "" : "")
  );

  // 所属工場バッジ（制限ユーザー共通）
  const lockedBadge = locked && (
    <span className="inline-flex h-[38px] items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 text-sm font-medium text-orange-800">
      <Factory className="h-4 w-4 shrink-0 text-orange-500" />
      所属: {lockedSiteName}
    </span>
  );

  if (sites.length === 0) {
    // 制限ユーザーで所属工場がマスタに無い場合も、所属だけは表示する
    return locked ? (
      <div className="flex flex-wrap items-end gap-2">{lockedBadge}</div>
    ) : null;
  }

  const areas = sites.find((s) => s.id === currentSite)?.areas ?? [];
  const hasFilter = Boolean((!locked && siteId) || areaId);

  return (
    <form ref={formRef} method="GET" className="flex flex-wrap items-end gap-2">
      {Object.entries(extraParams).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {locked ? (
        lockedBadge
      ) : (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">工場</span>
          <select
            name="site"
            value={currentSite}
            onChange={(e) => {
              setCurrentSite(e.target.value);
              // 工場が変わったら職場選択はリセットして即絞り込み
              const area = formRef.current?.elements.namedItem("area") as HTMLSelectElement | null;
              if (area) area.value = "";
              formRef.current?.requestSubmit();
            }}
            className={inputCls}
          >
            <option value="">すべての工場</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-500">職場</span>
        <select
          name="area"
          defaultValue={areaId ?? ""}
          disabled={!currentSite}
          onChange={() => formRef.current?.requestSubmit()}
          className={`${inputCls} disabled:bg-slate-50 disabled:text-slate-400`}
        >
          <option value="">すべての職場</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <button className="h-[38px] rounded-lg border border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-50">
          絞り込む
        </button>
        {hasFilter && (
          <Link
            href={basePath}
            className="inline-flex h-[38px] items-center rounded-lg px-2 text-sm text-slate-400 hover:text-slate-600"
          >
            クリア
          </Link>
        )}
      </div>
    </form>
  );
}
