"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { DOC_TYPE_LABEL, type DocType } from "@/lib/types";
import { uploadDocumentAction } from "@/lib/actions";
import { compressImageFile } from "@/lib/imageCompress";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

/**
 * 写真・書類のアップロードフォーム（クライアント）。
 * 画像は compressImageFile で縮小してから Server Action に渡す（iPhone写真のHEIC/容量対策）。
 * PDF などの非画像ファイルはそのまま送る。
 */
export default function DocumentUploadForm({ equipmentId }: { equipmentId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    if (!file) {
      setError("ファイルを選択してください");
      return;
    }
    setBusy(true);
    setError("");
    try {
      // 画像なら圧縮（失敗時は元ファイルのまま）。PDF等はそのまま。
      const upload = file.type.startsWith("image/") ? await compressImageFile(file) : file;
      const src = new FormData(form);
      const fd = new FormData();
      fd.set("equipmentId", equipmentId);
      fd.set("docType", String(src.get("docType") ?? "other"));
      fd.set("title", String(src.get("title") ?? ""));
      fd.set("file", upload, upload.name);
      await uploadDocumentAction(fd);
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="mb-4 rounded-xl bg-slate-50 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">種別</label>
          <select name="docType" defaultValue="photo" className={inputCls}>
            {(Object.keys(DOC_TYPE_LABEL) as DocType[]).map((t) => (
              <option key={t} value={t}>
                {DOC_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">タイトル（任意）</label>
          <input name="title" placeholder="例: 主軸まわりの写真" className={inputCls} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input type="file" name="file" accept="application/pdf,image/*" required className="text-sm" />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-800 disabled:opacity-60"
        >
          <span className="inline-flex items-center gap-1">
            <Upload className="h-3.5 w-3.5" />
            {busy ? "アップロード中…" : "アップロード"}
          </span>
        </button>
        <span className="text-xs text-slate-400">画像は自動で縮小されます</span>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </form>
  );
}
