"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, RotateCcw, Trash2, Loader2 } from "lucide-react";
import { compressImageFile } from "@/lib/imageCompress";
import { uploadMedia } from "@/lib/uploadMedia";
import { setProcedureDiagramAction } from "@/lib/actions";

type UploadState = "idle" | "compressing" | "uploading" | "saving" | "error";

/**
 * 点検部位マップの図面（写真/レイアウト図）アップロード・差し替え・削除。
 * 選択 → compressImageFile(2400, 0.85) → uploadMedia(kind:"diagram") → setProcedureDiagramAction。
 */
export default function ProcedureDiagramUploadForm({
  procedureId,
  diagramUrl,
}: {
  procedureId: string;
  diagramUrl: string | null;
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
        kind: "diagram",
        mediaType: "image",
        scopeId: procedureId,
        fileName: compressed.name,
        onProgress: setProgress,
      });
      setState("saving");
      await setProcedureDiagramAction(procedureId, url);
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
    if (!confirm("図面を削除しますか？各項目に配置したピンの座標は残りますが、図面は表示されなくなります。")) return;
    startDelete(async () => {
      await setProcedureDiagramAction(procedureId, null);
    });
  }

  const busy = state === "compressing" || state === "uploading" || state === "saving" || deleting;

  if (!diagramUrl) {
    return (
      <div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-4 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5 text-orange-500" />}
          写真・図面をアップロード
        </button>
        <p className="mt-1.5 text-xs text-slate-400">
          設備の写真やレイアウト図をアップロードすると、各点検項目を「部位」として図の上にピンで配置できます。
        </p>
        {busy && state === "uploading" && (
          <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${progress}%` }} />
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
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        {busy && !deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
        図面を差し替える
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onDelete}
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        図面を削除
      </button>
      {busy && !deleting && (
        <span className="text-xs text-slate-500">
          {state === "compressing" ? "圧縮中…" : state === "uploading" ? `アップロード中… ${progress}%` : "保存中…"}
        </span>
      )}
      {state === "error" && (
        <span className="flex items-center gap-2 text-xs text-red-600">
          {error}
          {lastFile && (
            <button type="button" onClick={() => void upload(lastFile)} className="font-semibold underline">
              再試行
            </button>
          )}
        </span>
      )}
    </div>
  );
}
