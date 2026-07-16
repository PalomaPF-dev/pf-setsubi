"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * メディア（写真・音声・動画）の全画面プレビュー。
 * document.body へポータルし、✕ボタン・背景タップ・Escape で閉じる。
 * 音声・動画は autoPlay（ユーザーのタップ起点なので iOS でも再生される）。
 */
export default function MediaLightbox({
  media,
  onClose,
}: {
  media: { type: "photo" | "audio" | "video"; url: string };
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // 背面のスクロールを止める
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="閉じる"
        className="absolute top-3 right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
      >
        <X className="h-6 w-6" />
      </button>

      <div
        className="flex max-h-full w-full max-w-3xl items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {media.type === "photo" && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={media.url}
            alt=""
            className="max-h-[85vh] max-w-full rounded-lg object-contain"
          />
        )}
        {media.type === "audio" && (
          <div className="w-full rounded-2xl bg-slate-900 p-6">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio src={media.url} controls autoPlay className="w-full" />
          </div>
        )}
        {media.type === "video" && (
          /* eslint-disable-next-line jsx-a11y/media-has-caption */
          <video
            src={media.url}
            controls
            playsInline
            autoPlay
            className="max-h-[85vh] max-w-full rounded-lg"
          />
        )}
      </div>
    </div>,
    document.body
  );
}
