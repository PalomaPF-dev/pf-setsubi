"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, FileDown, AlertCircle, CheckCircle2, Info } from "lucide-react";

// 固定列（src/lib/ledger.ts の LEDGER_IMPORT_HEADERS と同一。client のため文字列で保持）
const HEADER_KEYS = ["管理番号", "設備名", "カテゴリ", "メーカー", "型式", "製造番号", "設置場所", "状態", "導入日", "備考"];
const DISPLAY_HEADERS = ["管理番号*", "設備名*", "カテゴリ", "メーカー", "型式", "製造番号", "設置場所", "状態", "導入日", "備考"];
const TEMPLATE_ROW = ["S-0001", "NCフライス盤 1号機", "工作機械", "○○機械工業", "MB-46V", "12345678", "第1工場 Aライン", "稼働中", "2020-04-01", "毎朝始業前点検"];

// RFC4180 風の1パスパーサ。引用符内の改行・カンマ・"" エスケープに対応
// （行分割を先に行うとセル内改行で行が分断されるため、引用符状態を改行をまたいで維持する）。
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cols: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQ && text[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === "," && !inQ) {
      cols.push(cur); cur = "";
    } else if ((c === "\n" || c === "\r") && !inQ) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      cols.push(cur); rows.push(cols); cols = []; cur = "";
    } else {
      cur += c;
    }
  }
  cols.push(cur);
  rows.push(cols);
  return rows;
}

function downloadTemplate() {
  const bom = "﻿";
  const rows = [HEADER_KEYS.join(","), TEMPLATE_ROW.map((v) => `"${v}"`).join(",")].join("\r\n");
  const blob = new Blob([bom + rows], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "設備台帳インポートテンプレート.csv"; a.click();
  URL.revokeObjectURL(url);
}

interface Row { cols: string[]; }
interface ImportResult { success: number; skipped: number; errors: { row: number; managementNo: string; reason: string }[]; }

export default function EquipmentImportClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [headers, setHeaders] = useState<string[]>(HEADER_KEYS);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setRows([]); setHeaders(HEADER_KEYS); setFileName(""); setResult(null); setError("");
  }

  function handleFile(file: File) {
    setResult(null); setError("");
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const allRows = parseCSV(text).filter((r) => r.some((c) => c.trim()));
      if (allRows.length === 0) { setError("ファイルが空です"); return; }
      // ヘッダー行を検出（カスタム項目列の突合に使うためサーバーへも送る）
      const first = allRows[0];
      const isHeader = first[0].includes("管理番号") || first[0] === "managementNo";
      const headerRow = isHeader
        ? first.map((h) => h.replace(/[*＊]/g, "").trim())
        : HEADER_KEYS;
      const dataRows = isHeader ? allRows.slice(1) : allRows;
      if (dataRows.length === 0) { setError("データ行がありません"); return; }
      setHeaders(headerRow);
      setRows(dataRows.map((cols) => ({ cols })));
      setFileName(file.name);
    };
    reader.readAsText(file, "UTF-8");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function doImport() {
    if (rows.length === 0) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/equipment/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers, rows: rows.map((r) => r.cols) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "インポートに失敗しました"); return; }
      setResult(data);
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <Link href="/equipment" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        台帳に戻る
      </Link>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-800">CSVインポート</h1>
        <p className="mt-1 text-sm text-slate-500">ExcelやスプレッドシートのデータをCSVに書き出してまとめて取り込めます</p>
      </div>

      {/* テンプレートDL */}
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
        <div className="flex-1 text-sm text-orange-800">
          <p className="font-medium">CSVフォーマット</p>
          <p className="mt-0.5 text-xs">
            列順: 管理番号・設備名・カテゴリ・メーカー・型式・製造番号・設置場所・状態・導入日（YYYY-MM-DD）・備考
          </p>
          <p className="mt-0.5 text-xs">状態: 稼働中 / 休止中 / 修理中 / 廃止（省略時は「稼働中」）</p>
          <p className="mt-0.5 text-xs">
            さらに列を追加すると、列名が「設定」のカスタム項目名と一致する場合に取り込まれます（不一致の列は無視）
          </p>
        </div>
        <button
          onClick={downloadTemplate}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-orange-300 bg-white px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-50"
        >
          <FileDown className="h-3.5 w-3.5" />
          テンプレートDL
        </button>
      </div>

      {/* アップロードエリア */}
      {rows.length === 0 ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-white py-16 text-center hover:border-orange-400 hover:bg-orange-50"
        >
          <Upload className="h-10 w-10 text-slate-300" />
          <div>
            <p className="font-medium text-slate-600">CSVファイルをドロップ</p>
            <p className="text-sm text-slate-400">またはクリックしてファイルを選択</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      ) : (
        <div>
          {/* プレビュー */}
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">
              {fileName} — {rows.length} 件のデータを確認
            </p>
            <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600">
              ファイルを変更
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-xs">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-2 py-2 text-left font-medium text-slate-500 whitespace-nowrap">#</th>
                  {headers.map((h, i) => (
                    <th key={`${h}-${i}`} className="px-2 py-2 text-left font-medium text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.slice(0, 20).map((r, i) => (
                  <tr key={i} className={!r.cols[0] || !r.cols[1] ? "bg-red-50" : ""}>
                    <td className="px-2 py-1.5 text-slate-400">{i + 2}</td>
                    {Array.from({ length: headers.length }, (_, j) => (
                      <td key={j} className="px-2 py-1.5 text-slate-700 whitespace-nowrap">
                        {r.cols[j] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 20 && (
              <div className="border-t border-slate-200 px-4 py-2 text-center text-xs text-slate-400">
                …他 {rows.length - 20} 件（インポートは全件対象）
              </div>
            )}
          </div>

          {error && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {result && (
            <div className={`mt-3 rounded-lg px-4 py-3 text-sm ${result.errors.length > 0 ? "bg-amber-50 text-amber-800" : "bg-green-50 text-green-800"}`}>
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                インポート完了: {result.success} 件登録 / {result.skipped} 件スキップ（重複）
              </div>
              {result.errors.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e.row}行目 [{e.managementNo}]: {e.reason}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!result && (
            <div className="mt-4 flex gap-3">
              <button
                onClick={doImport}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-800 disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                {loading ? "インポート中…" : `${rows.length} 件をインポート`}
              </button>
            </div>
          )}

          {result && (
            <div className="mt-4 flex gap-3">
              <Link
                href="/equipment"
                className="inline-flex items-center gap-2 rounded-lg bg-orange-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-800"
              >
                台帳を確認する
              </Link>
              <button
                onClick={reset}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                別のファイルをインポート
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
