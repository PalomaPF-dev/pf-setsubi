"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  Upload,
  AlertCircle,
  CheckCircle2,
  Info,
  Trash2,
  ClipboardList,
  FileSpreadsheet,
} from "lucide-react";
import { importProceduresAction, type ImportProcedurePayload } from "@/lib/actions";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

const ITEM_TYPES = [
  { value: "ok_ng", label: "判定（OK/NG）" },
  { value: "numeric", label: "数値" },
  { value: "text", label: "テキスト" },
  { value: "photo", label: "写真" },
] as const;

interface DraftItem {
  label: string;
  itemType: string;
  instruction: string | null;
  unit: string | null;
  minValue: number | null;
  maxValue: number | null;
}

interface Draft {
  name: string;
  description: string | null;
  source: string;
  items: DraftItem[];
  /** プレビューで取り込み対象から外せる */
  included: boolean;
}

interface ParseError {
  file: string;
  reason: string;
}

export default function ChecklistImportClient() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ id: string; name: string }[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setDrafts([]);
    setParseErrors([]);
    setError("");
    setCreated(null);
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    setError("");
    setCreated(null);
    try {
      const fd = new FormData();
      for (const f of list) fd.append("files", f);
      const res = await fetch("/api/checklists/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "解析に失敗しました");
        return;
      }
      setParseErrors(data.errors ?? []);
      const parsed: Draft[] = (data.drafts ?? []).map((d: Omit<Draft, "included">) => ({
        ...d,
        included: true,
      }));
      setDrafts((prev) => [...prev, ...parsed]);
      if (parsed.length === 0 && (data.errors ?? []).length === 0) {
        setError("点検項目を検出できませんでした");
      }
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function updateDraft(di: number, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d, i) => (i === di ? { ...d, ...patch } : d)));
  }

  function updateItem(di: number, ii: number, patch: Partial<DraftItem>) {
    setDrafts((prev) =>
      prev.map((d, i) =>
        i === di
          ? { ...d, items: d.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) }
          : d
      )
    );
  }

  function removeItem(di: number, ii: number) {
    setDrafts((prev) =>
      prev.map((d, i) => (i === di ? { ...d, items: d.items.filter((_, j) => j !== ii) } : d))
    );
  }

  function removeDraft(di: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== di));
  }

  const targets = drafts.filter((d) => d.included && d.items.length > 0);

  async function doImport() {
    if (targets.length === 0) return;
    setImporting(true);
    setError("");
    try {
      const payload: ImportProcedurePayload[] = targets.map((d) => ({
        name: d.name,
        description: d.description,
        items: d.items.map((it) => ({
          label: it.label,
          itemType: it.itemType,
          instruction: it.instruction,
          unit: it.itemType === "numeric" ? it.unit : null,
          minValue: it.itemType === "numeric" ? it.minValue : null,
          maxValue: it.itemType === "numeric" ? it.maxValue : null,
        })),
      }));
      const result = await importProceduresAction(payload);
      setCreated(result.created);
      setDrafts([]);
      setParseErrors([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取り込みに失敗しました");
    } finally {
      setImporting(false);
    }
  }

  // ---- 完了画面 ----
  if (created) {
    return (
      <div>
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4" />
            {created.length} 件の手順書を作成しました
          </div>
          <ul className="mt-2 space-y-1">
            {created.map((c) => (
              <li key={c.id}>
                <Link href={`/checklists/${c.id}`} className="inline-flex items-center gap-1.5 text-green-900 underline hover:no-underline">
                  <ClipboardList className="h-3.5 w-3.5" />
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-4 flex gap-3">
          <Link
            href="/checklists"
            className="inline-flex items-center gap-2 rounded-lg bg-orange-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-800"
          >
            手順書一覧を確認する
          </Link>
          <button
            onClick={reset}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            続けて取り込む
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* 説明 */}
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
        <div className="text-sm text-orange-800">
          <p className="font-medium">いま使っている点検表をそのまま取り込めます</p>
          <p className="mt-0.5 text-xs">
            Excel（.xlsx / .xlsm / .xls）・PDF・CSV に対応。複数ファイル・複数シートをまとめて解析し、
            点検項目や基準値（「0.4〜0.6MPa」「80℃以下」等）を自動で読み取ります。
          </p>
          <p className="mt-0.5 text-xs">
            読み取り結果はプレビューで修正してから登録できます（登録後も自由に編集できます）。
          </p>
        </div>
      </div>

      {/* アップロードエリア */}
      <div
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-white text-center hover:border-orange-400 hover:bg-orange-50 ${
          drafts.length > 0 ? "py-6" : "py-16"
        }`}
      >
        <FileSpreadsheet className={`text-slate-300 ${drafts.length > 0 ? "h-6 w-6" : "h-10 w-10"}`} />
        <div>
          <p className="font-medium text-slate-600">
            {uploading ? "解析中…" : "点検表ファイルをドロップ（複数可）"}
          </p>
          <p className="text-sm text-slate-400">またはクリックしてファイルを選択（.xlsx / .xlsm / .xls / .csv / .pdf）</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".xlsx,.xlsm,.xls,.csv,.pdf,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
          }}
        />
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {parseErrors.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="h-4 w-4 shrink-0" />
            一部のファイルを解析できませんでした
          </div>
          <ul className="mt-1 space-y-0.5 text-xs">
            {parseErrors.map((e, i) => (
              <li key={i}>
                {e.file}: {e.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* プレビュー */}
      {drafts.length > 0 && (
        <div className="mt-5">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">
            読み取り結果のプレビュー（{drafts.length} 件）— 内容を確認・修正してください
          </h2>
          <div className="space-y-4">
            {drafts.map((d, di) => (
              <div
                key={di}
                className={`rounded-2xl border bg-white p-4 ${
                  d.included ? "border-slate-200" : "border-slate-200 opacity-50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={d.included}
                    onChange={(e) => updateDraft(di, { included: e.target.checked })}
                    className="mt-2.5 h-4 w-4 accent-orange-600"
                    aria-label="この手順書を取り込む"
                  />
                  <div className="min-w-0 flex-1">
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      手順書名（取り込み元: {d.source}）
                    </label>
                    <input
                      value={d.name}
                      onChange={(e) => updateDraft(di, { name: e.target.value })}
                      className={inputCls}
                      disabled={!d.included}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeDraft(di)}
                    className="mt-6 rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                    aria-label="このドラフトを削除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {d.included && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[640px] text-xs">
                      <thead className="border-b border-slate-200 bg-slate-50">
                        <tr>
                          <th className="px-2 py-2 text-left font-medium text-slate-500">#</th>
                          <th className="w-full px-2 py-2 text-left font-medium text-slate-500">点検項目</th>
                          <th className="px-2 py-2 text-left font-medium text-slate-500">入力タイプ</th>
                          <th className="px-2 py-2 text-left font-medium text-slate-500">単位</th>
                          <th className="px-2 py-2 text-left font-medium text-slate-500">下限</th>
                          <th className="px-2 py-2 text-left font-medium text-slate-500">上限</th>
                          <th className="px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {d.items.map((it, ii) => {
                          const numeric = it.itemType === "numeric";
                          return (
                            <tr key={ii}>
                              <td className="px-2 py-1.5 text-slate-400">{ii + 1}</td>
                              <td className="px-2 py-1.5">
                                <input
                                  value={it.label}
                                  onChange={(e) => updateItem(di, ii, { label: e.target.value })}
                                  className={inputCls}
                                />
                                {it.instruction && (
                                  <p className="mt-0.5 truncate text-[10px] text-slate-400" title={it.instruction}>
                                    {it.instruction}
                                  </p>
                                )}
                              </td>
                              <td className="px-2 py-1.5">
                                <select
                                  value={it.itemType}
                                  onChange={(e) => updateItem(di, ii, { itemType: e.target.value })}
                                  className={inputCls}
                                >
                                  {ITEM_TYPES.map((t) => (
                                    <option key={t.value} value={t.value}>
                                      {t.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  value={it.unit ?? ""}
                                  onChange={(e) => updateItem(di, ii, { unit: e.target.value || null })}
                                  disabled={!numeric}
                                  className={`${inputCls} w-16 disabled:bg-slate-50`}
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number"
                                  step="any"
                                  value={it.minValue ?? ""}
                                  onChange={(e) =>
                                    updateItem(di, ii, {
                                      minValue: e.target.value === "" ? null : Number(e.target.value),
                                    })
                                  }
                                  disabled={!numeric}
                                  className={`${inputCls} w-20 disabled:bg-slate-50`}
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number"
                                  step="any"
                                  value={it.maxValue ?? ""}
                                  onChange={(e) =>
                                    updateItem(di, ii, {
                                      maxValue: e.target.value === "" ? null : Number(e.target.value),
                                    })
                                  }
                                  disabled={!numeric}
                                  className={`${inputCls} w-20 disabled:bg-slate-50`}
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <button
                                  type="button"
                                  onClick={() => removeItem(di, ii)}
                                  className="rounded-lg p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                                  aria-label="この項目を削除"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {d.items.length === 0 && (
                      <p className="px-2 py-3 text-xs text-slate-400">
                        項目がありません（この手順書は取り込まれません）
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={doImport}
              disabled={importing || targets.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-800 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {importing ? "取り込み中…" : `${targets.length} 件の手順書を作成`}
            </button>
            <button
              onClick={reset}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              やり直す
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
