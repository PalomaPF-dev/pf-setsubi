"use client";

import { useRef, useState } from "react";
import { Camera, Image as ImageIcon, RotateCcw, Trash2, Loader2 } from "lucide-react";
import { compressImageFile } from "@/lib/imageCompress";

type UploadState = "idle" | "compressing" | "uploading" | "done" | "error";

/**
 * 点検写真の撮影・選択 → 圧縮 → 逐次アップロード。
 * capture 指定はライブラリ選択を塞ぐため「撮影」「ライブラリ」の2ボタン＝2つの hidden input。
 * アップロード完了で onChange(url) を呼ぶ（URL はサーバー保存時にまとめて使う）。
 */
export default function PhotoInput({
  value,
  onChange,
  draftKey,
  itemId,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  draftKey: string;
  itemId: string;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>(value ? "done" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);

  async function upload(file: File) {
    setError(null);
    setState("compressing");
    setLastFile(file);
    try {
      const compressed = await compressImageFile(file);
      setState("uploading");
      const fd = new FormData();
      fd.append("file", compressed);
      fd.append("draftKey", draftKey);
      fd.append("itemId", itemId);
      const res = await fetch("/api/upload/inspection-photo", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `アップロードに失敗しました (${res.status})`);
      }
      const { url } = (await res.json()) as { url: string };
      onChange(url);
      setState("done");
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

  /** 「撮影する」。capture 付き input に委ねる（モバイルブラウザではカメラが起動する）。 */
  function onCamera() {
    cameraRef.current?.click();
  }

  const busy = state === "compressing" || state === "uploading";

  return (
    <div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />
      <input ref={libraryRef} type="file" accept="image/*" className="hidden" onChange={onPick} />

      {value && state === "done" ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="点検写真" className="h-24 w-24 rounded-lg border border-slate-200 object-cover" />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onCamera}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" />
              撮り直す
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setState("idle");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <Trash2 className="h-4 w-4" />
              削除
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onCamera}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-orange-700 text-sm font-semibold text-white hover:bg-orange-800 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
              撮影する
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => libraryRef.current?.click()}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <ImageIcon className="h-5 w-5" />
              ライブラリ
            </button>
          </div>
          {busy && (
            <p className="text-xs text-slate-500">
              {state === "compressing" ? "画像を圧縮しています…" : "アップロード中…"}
            </p>
          )}
          {state === "error" && (
            <div className="flex items-center gap-2 text-xs text-red-600">
              <span>{error}</span>
              {lastFile && (
                <button type="button" onClick={() => void upload(lastFile)} className="font-semibold underline">
                  再試行
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
