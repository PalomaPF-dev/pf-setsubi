"use client";

import { useState } from "react";
import { MapPin, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import { setEquipmentMapPositionAction } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";

const STEP = 0.5; // 微調整の1タップぶん（%）

const clamp = (v: number) => Math.min(100, Math.max(0, v));

/**
 * 設備のマップ配置エディタ。
 * マップをタップして候補ピン → 十字ボタン（44px）で ±0.5% 微調整 → 「この位置で保存」。
 * 保存は hidden の x,y を setEquipmentMapPositionAction（bind 済み）に渡す。
 */
export default function FactoryMapEditor({
  equipmentId,
  factory,
  otherPins,
  current,
}: {
  equipmentId: string;
  factory: { id: string; name: string; mapUrl: string };
  otherPins: Array<{ equipmentId: string; name: string; x: number; y: number }>;
  current: { x: number; y: number } | null;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(current);

  function onMapClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    setPos({
      x: clamp(((e.clientX - rect.left) / rect.width) * 100),
      y: clamp(((e.clientY - rect.top) / rect.height) * 100),
    });
  }

  function nudge(dx: number, dy: number) {
    setPos((p) => (p ? { x: clamp(p.x + dx), y: clamp(p.y + dy) } : p));
  }

  const nudgeBtnCls =
    "inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">
        「{factory.name}」のマップ上で、この設備の位置をタップしてください。
      </p>

      <div
        className="relative cursor-crosshair overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
        onClick={onMapClick}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={factory.mapUrl} alt="工場マップ" className="pointer-events-none block h-auto w-full select-none" draggable={false} />

        {/* 他の設備（参考表示） */}
        {otherPins.map((p) => (
          <span
            key={p.equipmentId}
            title={p.name}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            <MapPin className="h-5 w-5 fill-slate-300 text-white opacity-80" />
          </span>
        ))}

        {/* 候補ピン */}
        {pos && (
          <span
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          >
            <MapPin className="h-9 w-9 fill-orange-600 text-white drop-shadow-md" />
          </span>
        )}
      </div>

      {pos ? (
        <div className="flex flex-wrap items-center gap-4">
          {/* 十字微調整（±0.5%） */}
          <div className="grid grid-cols-3 gap-1" aria-label="位置の微調整">
            <div />
            <button type="button" onClick={() => nudge(0, -STEP)} className={nudgeBtnCls} aria-label="上へ微調整">
              <ArrowUp className="h-4 w-4" />
            </button>
            <div />
            <button type="button" onClick={() => nudge(-STEP, 0)} className={nudgeBtnCls} aria-label="左へ微調整">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => nudge(0, STEP)} className={nudgeBtnCls} aria-label="下へ微調整">
              <ArrowDown className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => nudge(STEP, 0)} className={nudgeBtnCls} aria-label="右へ微調整">
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <form action={setEquipmentMapPositionAction.bind(null, equipmentId)} className="flex items-center gap-2">
            <input type="hidden" name="x" value={pos.x.toFixed(3)} />
            <input type="hidden" name="y" value={pos.y.toFixed(3)} />
            <SubmitButton pendingText="保存中…" className="h-11">この位置で保存</SubmitButton>
          </form>
        </div>
      ) : (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">
          マップをタップすると候補ピンが表示されます。
        </p>
      )}
    </div>
  );
}
