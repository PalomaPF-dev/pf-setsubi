"use client";

import { useState } from "react";
import { Play, Volume2 } from "lucide-react";
import MediaLightbox from "@/components/MediaLightbox";

export interface MediaStripItem {
  type: "photo" | "audio" | "video";
  url: string;
  durationSeconds?: number | null;
  label?: string;
}

/** 秒 → m:ss 表記（例 45 → 0:45、75 → 1:15）。 */
export function formatDuration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * メディアの横スクロールサムネイル1行（h-20）。
 * 点検箇所写真（spotPhotoUrl）は「点検箇所」バッジ付きで先頭に出す。
 * タップで MediaLightbox 全画面プレビュー。
 */
export default function MediaStrip({
  items,
  spotPhotoUrl,
}: {
  items: MediaStripItem[];
  spotPhotoUrl?: string | null;
}) {
  const [open, setOpen] = useState<{ type: "photo" | "audio" | "video"; url: string } | null>(
    null
  );

  if (!spotPhotoUrl && items.length === 0) return null;

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {spotPhotoUrl && (
          <button
            type="button"
            onClick={() => setOpen({ type: "photo", url: spotPhotoUrl })}
            className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={spotPhotoUrl} alt="点検箇所" className="h-full w-full object-cover" />
            <span className="absolute bottom-0 left-0 rounded-tr-md bg-orange-700/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
              点検箇所
            </span>
          </button>
        )}

        {items.map((m, i) => {
          const key = `${m.url}-${i}`;
          if (m.type === "photo") {
            return (
              <button
                key={key}
                type="button"
                onClick={() => setOpen({ type: "photo", url: m.url })}
                className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.url}
                  alt={m.label ?? "見本写真"}
                  className="h-full w-full object-cover"
                />
              </button>
            );
          }
          if (m.type === "audio") {
            return (
              <button
                key={key}
                type="button"
                onClick={() => setOpen({ type: "audio", url: m.url })}
                className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
              >
                <Volume2 className="h-6 w-6 text-orange-700" />
                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                  {formatDuration(m.durationSeconds)}
                </span>
              </button>
            );
          }
          return (
            <button
              key={key}
              type="button"
              onClick={() => setOpen({ type: "video", url: m.url })}
              className="relative flex h-20 w-28 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-white hover:bg-slate-700"
            >
              <Play className="h-7 w-7 fill-white" />
              <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold">
                {formatDuration(m.durationSeconds)}
              </span>
            </button>
          );
        })}
      </div>

      {open && <MediaLightbox media={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
