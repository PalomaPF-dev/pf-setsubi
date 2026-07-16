// ===== CSV 生成ユーティリティ =====

type Cell = string | number | null | undefined;

/** 1セルを CSV エスケープ。先頭が =,+,-,@ の場合は数式インジェクション対策で ' を前置。 */
function escapeCell(value: Cell): string {
  let s = value == null ? "" : String(value);
  // CSV インジェクション（Excel 等で数式として評価される）対策
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * ヘッダ＋行を CSV 文字列に。改行は CRLF、Excel(日本語)文字化け防止に UTF-8 BOM を付与。
 */
const BOM = String.fromCharCode(0xfeff); // Excel(日本語)の文字化け防止

export function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(escapeCell).join(","));
  return BOM + lines.join("\r\n");
}
