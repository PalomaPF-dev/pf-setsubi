"use client";

import { useEffect, useRef, useState } from "react";
import { Video, Film, Loader2, RotateCcw, Check } from "lucide-react";
import { uploadMedia } from "@/lib/uploadMedia";
import { compressVideoFile } from "@/lib/videoCompress";
import {
  MEDIA_MAX_BYTES,
  VIDEO_MAX_SECONDS,
  ALLOWED_MEDIA_CONTENT_TYPES,
} from "@/lib/mediaLimits";

/** アップロード完了時に親へ渡す結果（durationSec はメタデータ取得不能時 null）。 */
export interface VideoInputResult {
  url: string;
  durationSec: number | null;
  sizeBytes: number;
  contentType?: string;
}

type VState = "idle" | "checking" | "preview" | "compressing" | "uploading" | "done" | "error";

const MAX_MB = Math.round(MEDIA_MAX_BYTES / 1024 / 1024);

/** <video preload="metadata"> で長さを取得する（取れなければ null）。 */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    const done = (d: number | null) => {
      URL.revokeObjectURL(url);
      resolve(d);
    };
    video.onloadedmetadata = () => {
      const d = video.duration;
      done(Number.isFinite(d) && d > 0 ? d : null);
    };
    video.onerror = () => done(null);
    video.src = url;
  });
}

/**
 * 動画の撮影/選択 → 長さ・サイズ検証 → プレビュー → アップロード。
 * capture 指定はライブラリ選択を塞ぐため「撮影」「ライブラリ」の2ボタン＝2つの hidden input。
 * 完了で onComplete({url, durationSec, sizeBytes, ...}) を await する（DB 登録は親の責務）。
 */
export default function VideoInput({
  onComplete,
  keyPrefix,
  kind,
  onCancel,
}: {
  onComplete: (result: VideoInputResult) => void | Promise<void>;
  /** アップロード先パスのスコープ（itemId / draftKey など） */
  keyPrefix: string;
  kind: "ref" | "result";
  onCancel?: () => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<VState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fileRef = useRef<File | null>(null);
  const durationRef = useRef<number | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  function discardPreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    fileRef.current = null;
    durationRef.current = null;
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);

    if (file.size > MEDIA_MAX_BYTES) {
      setError(`動画は${MAX_MB}MBまでです。短く撮り直すか、別のファイルを選んでください`);
      setState("idle");
      return;
    }
    const base = (file.type || "").split(";")[0].trim().toLowerCase();
    if (base && !ALLOWED_MEDIA_CONTENT_TYPES.video.includes(base)) {
      setError("この動画形式は登録できません（MP4 / MOV / WebM）");
      setState("idle");
      return;
    }

    setState("checking");
    const duration = await readDuration(file);
    // 31秒超は拒否（取得不能な形式はサイズ検証のみで通す）
    if (duration != null && duration > VIDEO_MAX_SECONDS + 1) {
      setError(
        `${VIDEO_MAX_SECONDS}秒以内で撮り直してください（選択した動画は約${Math.round(duration)}秒）`
      );
      setState("idle");
      return;
    }

    discardPreview();
    fileRef.current = file;
    durationRef.current = duration;
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setPreviewUrl(url);
    setState("preview");
  }

  async function upload() {
    const original = fileRef.current;
    if (!original) return;
    setError(null);
    setProgress(0);
    try {
      // 電波の弱い現場での待ち時間を減らすため、送る前に再エンコードして軽くする。
      // 失敗しても compressVideoFile が元ファイルを返すのでアップロードは止まらない。
      setState("compressing");
      const file = await compressVideoFile(original, setProgress);

      setProgress(0);
      setState("uploading");
      const { url } = await uploadMedia(file, {
        kind,
        mediaType: "video",
        scopeId: keyPrefix,
        onProgress: setProgress,
      });
      setState("done");
      await onComplete({
        url,
        durationSec: durationRef.current != null ? Math.round(durationRef.current) : null,
        sizeBytes: file.size,
        contentType: (file.type || "").split(";")[0].trim().toLowerCase() || undefined,
      });
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "アップロードに失敗しました");
    }
  }

  function reselect() {
    setError(null);
    discardPreview();
    setState("idle");
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <input
        ref={cameraRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void onPick(e)}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => void onPick(e)}
      />

      {state === "idle" && (
        <div className="flex flex-col gap-2">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-orange-700 text-sm font-semibold text-white hover:bg-orange-800"
            >
              <Video className="h-5 w-5" />
              撮影する
            </button>
            <button
              type="button"
              onClick={() => libraryRef.current?.click()}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Film className="h-5 w-5" />
              ライブラリ
            </button>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="self-end text-xs font-medium text-slate-500 underline hover:text-slate-700"
            >
              キャンセル
            </button>
          )}
        </div>
      )}

      {state === "checking" && (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          動画を確認しています…
        </div>
      )}

      {state === "preview" && previewUrl && (
        <div className="flex flex-col gap-2">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            controls
            playsInline
            src={previewUrl}
            className="max-h-48 w-full rounded-lg border border-slate-200 bg-black"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={reselect}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" />
              選び直す
            </button>
            <button
              type="button"
              onClick={() => void upload()}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-orange-700 text-sm font-semibold text-white hover:bg-orange-800"
            >
              <Check className="h-4 w-4" />
              この動画を使う
            </button>
          </div>
        </div>
      )}

      {state === "compressing" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            動画を軽くしています… {progress}%
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-orange-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-slate-400">
            通信量を減らすため送信前に圧縮しています（動画の長さと同じくらいかかります）
          </p>
        </div>
      )}

      {state === "uploading" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            アップロード中… {progress}%
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-orange-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {state === "done" && (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          登録しています…
        </div>
      )}

      {state === "error" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-red-600">{error}</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={reselect}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" />
              選び直す
            </button>
            <button
              type="button"
              onClick={() => void upload()}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-orange-700 text-sm font-semibold text-white hover:bg-orange-800"
            >
              再試行
            </button>
          </div>
        </div>
      )}

      <p className="mt-2 text-xs text-slate-400">
        動画は{VIDEO_MAX_SECONDS}秒・{MAX_MB}MBまで（送信前に自動で圧縮します）
      </p>
    </div>
  );
}
