"use client";

import { useState } from "react";
import { Maximize2, X } from "lucide-react";

export interface DiagramPin {
  id: string;
  label: string;
  /** 表示する番号（項目一覧での並び順 1始まり）。エディタ・印刷と一致させる */
  number: number;
  x: number;
  y: number;
}

/**
 * 点検部位マップの閲覧（点検時など）。図面に番号付きピンを重ね、
 * 指定項目のピンを強調表示する。タップで全画面拡大。
 */
export default function ProcedureDiagramView({
  diagramUrl,
  pins,
  highlightId,
}: {
  diagramUrl: string;
  pins: DiagramPin[];
  highlightId?: string | null;
}) {
  const [zoom, setZoom] = useState(false);

  const pinEls = (large: boolean) =>
    pins.map((p) => {
      const active = p.id === highlightId;
      const size = large ? "h-8 w-8 text-sm" : "h-6 w-6 text-xs";
      return (
        <span
          key={p.id}
          title={p.label}
          className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 ${active ? "z-20" : "z-10"}`}
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
        >
          <span
            className={`flex items-center justify-center rounded-full border-2 border-white font-bold text-white shadow-md ${size} ${
              active ? "scale-125 bg-orange-700 ring-2 ring-orange-300" : "bg-rose-500/80"
            }`}
          >
            {p.number}
          </span>
        </span>
      );
    });

  return (
    <>
      <button
        type="button"
        onClick={() => setZoom(true)}
        className="relative block w-full overflow-hidden rounded-xl border border-slate-200 bg-white"
        aria-label="点検部位マップを拡大"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={diagramUrl}
          alt="点検部位マップ"
          className="block h-auto w-full select-none"
          draggable={false}
        />
        {pinEls(false)}
        <span className="absolute right-1.5 bottom-1.5 z-30 inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-1 text-[11px] font-medium text-white">
          <Maximize2 className="h-3 w-3" />
          拡大
        </span>
      </button>

      {zoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoom(false)}
        >
          <button
            type="button"
            onClick={() => setZoom(false)}
            className="absolute top-4 right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
            aria-label="閉じる"
          >
            <X className="h-6 w-6" />
          </button>
          <div
            className="relative max-h-full max-w-3xl overflow-auto rounded-xl bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={diagramUrl} alt="点検部位マップ" className="block h-auto w-full select-none" draggable={false} />
              {pinEls(true)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
