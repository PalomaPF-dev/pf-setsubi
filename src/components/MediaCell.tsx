"use client";

import { useState } from "react";
import { Play, Volume2 } from "lucide-react";
import type { ResultMedia } from "@/lib/types";
import MediaLightbox from "@/components/MediaLightbox";
import { formatDuration } from "@/components/MediaStrip";

/**
 * 記録詳細テーブルの「写真・メディア」列に出す小さなメディアボタン群。
 * 音声/動画/追加写真をアイコンボタンで並べ、タップで MediaLightbox 再生。
 */
export default function MediaCell({ media }: { media: ResultMedia[] }) {
  const [open, setOpen] = useState<{ type: "photo" | "audio" | "video"; url: string } | null>(
    null
  );

  if (media.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {media.map((m) => {
        if (m.mediaType === "photo") {
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setOpen({ type: "photo", url: m.url })}
              title="追加写真"
              className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-md border border-slate-200 hover:opacity-80"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt="追加写真" className="h-full w-full object-cover" />
            </button>
          );
        }
        if (m.mediaType === "audio") {
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setOpen({ type: "audio", url: m.url })}
              title={`音声 ${formatDuration(m.durationSeconds)}`}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
            >
              <Volume2 className="h-4 w-4 text-orange-700" />
              {formatDuration(m.durationSeconds)}
            </button>
          );
        }
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => setOpen({ type: "video", url: m.url })}
            title={`動画 ${formatDuration(m.durationSeconds)}`}
            className="inline-flex h-9 items-center gap-1 rounded-md bg-slate-800 px-2 text-[11px] font-semibold text-white hover:bg-slate-700"
          >
            <Play className="h-4 w-4 fill-white" />
            {formatDuration(m.durationSeconds)}
          </button>
        );
      })}

      {open && <MediaLightbox media={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
