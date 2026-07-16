"use client";

import { useState } from "react";
import Link from "next/link";
import { MapPin, ExternalLink } from "lucide-react";
import type { EquipmentStatus, EquipmentCondition } from "@/lib/types";

export interface FactoryMapPin {
  equipmentId: string;
  name: string;
  managementNo: string;
  status: EquipmentStatus;
  x: number; // 画像に対する % 0-100
  y: number;
  /** コンディション（渡されればピン色はこちらを優先。モニタリング用） */
  condition?: EquipmentCondition;
  /** 異常時の NG 項目名（ポップオーバーに表示） */
  ngItemLabels?: string[];
}

/** 状態ごとのピン色（fill-* で塗り、stroke は白でコントラスト確保） */
const PIN_FILL: Record<EquipmentStatus, string> = {
  active: "fill-orange-700",
  stopped: "fill-slate-400",
  repair: "fill-amber-500",
  retired: "fill-slate-300",
};

/** コンディションごとのピン色。 */
const CONDITION_FILL: Record<EquipmentCondition, string> = {
  abnormal: "fill-red-500",
  warning: "fill-amber-400",
  normal: "fill-emerald-500",
  stopped: "fill-slate-400",
};

/**
 * 工場マップ表示（閲覧用）。
 * 画像自身が高さを決める（<img w-full h-auto>、object-contain 禁止）。
 * ピンはタップでポップオーバー（設備名+管理番号+詳細リンク）、他をタップで閉じる。
 * ズームの代替として「原寸で開く」リンクを右上に出す。
 */
export default function FactoryMap({
  mapUrl,
  pins,
  highlightId,
}: {
  mapUrl: string;
  pins: FactoryMapPin[];
  highlightId?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = pins.find((p) => p.equipmentId === openId) ?? null;

  return (
    <div>
      <div className="mb-1.5 flex justify-end">
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          原寸で開く
        </a>
      </div>
      <div
        className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
        onClick={() => setOpenId(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mapUrl} alt="工場マップ" className="block h-auto w-full select-none" draggable={false} />

        {pins.map((p) => {
          const isHl = p.equipmentId === highlightId;
          return (
            <button
              key={p.equipmentId}
              type="button"
              aria-label={`${p.name}（${p.managementNo}）`}
              onClick={(e) => {
                e.stopPropagation();
                setOpenId(openId === p.equipmentId ? null : p.equipmentId);
              }}
              className={`absolute flex h-11 w-11 -translate-x-1/2 -translate-y-full items-end justify-center ${
                isHl ? "z-20" : "z-10"
              }`}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            >
              <MapPin
                className={`drop-shadow-md ${
                  isHl
                    ? "h-9 w-9 fill-red-500"
                    : "h-7 w-7 " + (p.condition ? CONDITION_FILL[p.condition] : PIN_FILL[p.status])
                } text-white`}
              />
            </button>
          );
        })}

        {/* ポップオーバー（画面端では横位置・上下を反転） */}
        {open && (
          <div
            className="absolute z-30 w-48 rounded-lg border border-slate-200 bg-white p-2.5 shadow-lg"
            style={{
              left: `${open.x}%`,
              top: `${open.y}%`,
              transform: [
                open.x > 66 ? "translateX(-90%)" : open.x < 33 ? "translateX(-10%)" : "translateX(-50%)",
                open.y < 25 ? "translateY(10px)" : "translateY(calc(-100% - 40px))",
              ].join(" "),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="truncate text-sm font-medium text-slate-800">{open.name}</div>
            <div className="font-mono text-xs text-slate-400">{open.managementNo}</div>
            {open.condition === "abnormal" && open.ngItemLabels && open.ngItemLabels.length > 0 && (
              <div className="mt-1.5 border-t border-slate-100 pt-1.5">
                <div className="mb-1 text-[10px] font-semibold text-red-600">異常点検項目</div>
                <div className="flex flex-wrap gap-1">
                  {open.ngItemLabels.map((label, i) => (
                    <span
                      key={i}
                      className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-inset ring-red-600/20"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <Link
              href={`/equipment/${open.equipmentId}`}
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-orange-700 hover:underline"
            >
              詳細を見る →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
