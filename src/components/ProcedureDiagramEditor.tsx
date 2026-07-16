"use client";

import { useState, useTransition } from "react";
import { MapPin, X, Check, Crosshair, Loader2 } from "lucide-react";
import { setItemMapPositionAction, clearItemMapPositionAction } from "@/lib/actions";

const clamp = (v: number) => Math.min(100, Math.max(0, v));

export interface DiagramItem {
  id: string;
  label: string;
  mapX: number | null;
  mapY: number | null;
}

/**
 * 点検部位マップの編集。図面の上に、各点検項目を番号付きピンで配置する。
 * 操作: 下の項目チップを選択 → 図面をタップして配置/移動。もう一度タップで位置を微修正。
 * 各ピンは項目の並び順の番号を表示。
 */
export default function ProcedureDiagramEditor({
  procedureId,
  diagramUrl,
  items,
}: {
  procedureId: string;
  diagramUrl: string;
  items: DiagramItem[];
}) {
  // ピン座標のローカル状態（楽観更新）。key = itemId
  const [pins, setPins] = useState<Record<string, { x: number; y: number }>>(() => {
    const init: Record<string, { x: number; y: number }> = {};
    for (const it of items) {
      if (it.mapX != null && it.mapY != null) init[it.id] = { x: it.mapX, y: it.mapY };
    }
    return init;
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function place(x: number, y: number) {
    if (!selectedId) return;
    const id = selectedId;
    const nx = clamp(x);
    const ny = clamp(y);
    setPins((p) => ({ ...p, [id]: { x: nx, y: ny } }));
    setSavingId(id);
    startTransition(async () => {
      try {
        await setItemMapPositionAction(id, procedureId, nx, ny);
      } finally {
        setSavingId((cur) => (cur === id ? null : cur));
      }
    });
    // 次の未配置項目へ自動で進む（配置し終えたら選択解除）
    const next = items.find((it) => it.id !== id && !pins[it.id]);
    setSelectedId(next ? next.id : null);
  }

  function onMapClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!selectedId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    place(((e.clientX - rect.left) / rect.width) * 100, ((e.clientY - rect.top) / rect.height) * 100);
  }

  function clearPin(id: string) {
    setPins((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
    setSavingId(id);
    startTransition(async () => {
      try {
        await clearItemMapPositionAction(id, procedureId);
      } finally {
        setSavingId((cur) => (cur === id ? null : cur));
      }
    });
  }

  const placedCount = items.filter((it) => pins[it.id]).length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">
        {selectedId ? (
          <span className="font-medium text-orange-700">
            図面をタップして「{items.find((it) => it.id === selectedId)?.label}」の位置を指定してください。
          </span>
        ) : (
          <>下の点検項目を選んでから、図面上の該当部位をタップするとピンが立ちます（{placedCount}/{items.length} 配置済み）。</>
        )}
      </p>

      {/* 図面 */}
      <div
        className={`relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 ${
          selectedId ? "cursor-crosshair ring-2 ring-orange-400" : ""
        }`}
        onClick={onMapClick}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={diagramUrl}
          alt="点検部位マップ"
          className="pointer-events-none block h-auto w-full select-none"
          draggable={false}
        />
        {items.map((it, idx) => {
          const p = pins[it.id];
          if (!p) return null;
          const active = selectedId === it.id;
          return (
            <span
              key={it.id}
              title={it.label}
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-md ${
                  active ? "bg-orange-700 ring-2 ring-orange-300" : "bg-rose-500"
                }`}
              >
                {idx + 1}
              </span>
            </span>
          );
        })}
      </div>

      {/* 項目チップ */}
      <ul className="flex flex-col gap-1.5">
        {items.map((it, idx) => {
          const placed = !!pins[it.id];
          const selected = selectedId === it.id;
          const saving = savingId === it.id;
          return (
            <li
              key={it.id}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
                selected
                  ? "border-orange-400 bg-orange-50"
                  : placed
                    ? "border-slate-200 bg-white"
                    : "border-dashed border-slate-300 bg-slate-50"
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedId(selected ? null : it.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                    placed ? "bg-rose-500" : "bg-slate-300"
                  }`}
                >
                  {idx + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{it.label}</span>
                {saving ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" />
                ) : placed ? (
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-emerald-600">
                    <Check className="h-3.5 w-3.5" />
                    配置済み
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-slate-400">
                    <Crosshair className="h-3.5 w-3.5" />
                    未配置
                  </span>
                )}
              </button>
              {selected && !placed && (
                <span className="shrink-0 text-xs font-medium text-orange-700">選択中</span>
              )}
              {placed && (
                <button
                  type="button"
                  onClick={() => clearPin(it.id)}
                  className="shrink-0 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                  aria-label="ピンを解除"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {items.length === 0 && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">
          先に点検項目を追加すると、ここで図面上に配置できます。
        </p>
      )}
    </div>
  );
}
