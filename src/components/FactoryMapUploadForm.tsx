"use client";

import { useRef, useState, useTransition } from "react";
import { Map, RotateCcw, Trash2, Loader2 } from "lucide-react";
import { compressImageFile } from "@/lib/imageCompress";
import { uploadMedia } from "@/lib/uploadMedia";
import { setSiteMapImageAction } from "@/lib/actions";

type UploadState = "idle" | "compressing" | "uploading" | "saving" | "error";

/**
 * 工場マップ画像のアップロード/差し替え/削除（設定ページ用）。
 * 選択 → compressImageFile(2400, 0.85) → uploadMedia(kind:"sitemap") → setSiteMapImageAction。
 * 旧画像の Blob 削除はサーバー側（Action）で行う。
 */
export default function FactoryMapUploadForm({
  siteId,
  mapUrl,
}: {
  siteId: string;
  mapUrl: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [deleting, startDelete] = useTransition();

  async function upload(file: File) {
    setError(null);
    setLastFile(file);
    setState("compressing");
    try {
      const compressed = await compressImageFile(file, 2400, 0.85);
      setState("uploading");
      setProgress(0);
      const { url } = await uploadMedia(compressed, {
        kind: "sitemap",
        mediaType: "image",
        scopeId: siteId,
        fileName: compressed.name,
        onProgress: setProgress,
      });
      setState("saving");
      await setSiteMapImageAction(siteId, url);
      setState("idle");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "アップロードに失敗しました");
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void upload(file);
  }

  function onDelete() {
    if (!confirm("マップ画像を削除しますか？配置済みのピンの座標は残りますが、マップは表示されなくなります。")) return;
    startDelete(async () => {
      await setSiteMapImageAction(siteId, null);
    });
  }

  const busy = state === "compressing" || state === "uploading" || state === "saving" || deleting;

  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-slate-500">マップ画像（レイアウト図・見取り図）</div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />

      {mapUrl ? (
        <div className="flex items-start gap-3">
          <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="block shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mapUrl}
              alt="工場マップ"
              className="h-24 w-32 rounded-lg border border-slate-200 bg-white object-cover"
            />
          </a>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {busy && !deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              差し替える
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              削除
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-4 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Map className="h-5 w-5 text-orange-500" />}
          マップ画像をアップロード
        </button>
      )}

      {busy && !deleting && (
        <div className="mt-2">
          <p className="text-xs text-slate-500">
            {state === "compressing"
              ? "画像を圧縮しています…"
              : state === "uploading"
                ? `アップロード中… ${progress}%`
                : "保存しています…"}
          </p>
          {state === "uploading" && (
            <div className="mt-1 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
      )}
      {state === "error" && (
        <div className="mt-2 flex items-center gap-2 text-xs text-red-600">
          <span>{error}</span>
          {lastFile && (
            <button type="button" onClick={() => void upload(lastFile)} className="font-semibold underline">
              再試行
            </button>
          )}
        </div>
      )}
      {!mapUrl && state !== "error" && (
        <p className="mt-1.5 text-xs text-slate-400">
          アップロードすると、設備をマップ上にピンで配置できるようになります。
        </p>
      )}
    </div>
  );
}
