import type { ItemType } from "./types";

// ===== 点検表ファイル（Excel/PDF/CSV）の取り込み解析 =====
//
// 既存の点検表ファイルから「手順書ドラフト」を抽出する。
// 抽出結果はあくまで下書きで、ユーザーがプレビュー画面で修正してから登録する前提。

export interface ImportDraftItem {
  label: string;
  itemType: ItemType;
  instruction: string | null;
  unit: string | null;
  minValue: number | null;
  maxValue: number | null;
}

export interface ProcedureDraft {
  /** 手順書名（タイトルセル → シート名 → ファイル名 の順で推定） */
  name: string;
  description: string | null;
  /** 取り込み元の表示用（例: "点検表.xlsx / 日常点検"） */
  source: string;
  items: ImportDraftItem[];
}

export const IMPORT_LIMITS = {
  maxFileBytes: 8 * 1024 * 1024,
  maxFiles: 10,
  maxSheets: 20,
  maxItemsPerDraft: 200,
  maxNameLen: 120,
  maxLabelLen: 200,
  maxInstructionLen: 500,
} as const;

// ---- 共通ヘルパ ----

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** 全角数字・記号を半角へ寄せる（数値抽出用） */
function toHalfWidth(s: string): string {
  return s
    .replace(/[０-９．]/g, (c) => (c === "．" ? "." : String.fromCharCode(c.charCodeAt(0) - 0xfee0)))
    .replace(/[～〜]/g, "~")
    .replace(/－/g, "-");
}

const NUM_RE = "([-+]?\\d+(?:\\.\\d+)?)";

/**
 * 「0.4~0.6MPa」「80℃以下」「2mm以上」等の基準表記から数値範囲と単位を推定する。
 * 読み取れない場合は null（表記は instruction として残す）。
 */
export function parseCriteria(
  raw: string
): { min: number | null; max: number | null; unit: string | null } | null {
  const s = toHalfWidth(norm(raw));
  if (!s) return null;
  const unitOf = (rest: string): string | null => {
    const m = rest.match(/^\s*([a-zA-Zμ℃%°Ω/·²³]+)/);
    return m ? m[1] : null;
  };
  let m = s.match(new RegExp(`${NUM_RE}\\s*~\\s*${NUM_RE}(.*)$`));
  if (m) return { min: Number(m[1]), max: Number(m[2]), unit: unitOf(m[3]) };
  m = s.match(new RegExp(`${NUM_RE}(.*?)(以上|min)`, "i"));
  if (m) return { min: Number(m[1]), max: null, unit: unitOf(m[2]) };
  m = s.match(new RegExp(`${NUM_RE}(.*?)(以下|未満|max)`, "i"));
  if (m) return { min: null, max: Number(m[1]), unit: unitOf(m[2]) };
  return null;
}

/** ラベル・基準値から入力タイプを推定する。 */
function guessItemType(label: string, hasNumericHint: boolean): ItemType {
  if (hasNumericHint) return "numeric";
  if (/写真|撮影/.test(label)) return "photo";
  if (/(を記録|を記入|メモ|特記事項)/.test(label)) return "text";
  return "ok_ng";
}

function buildItem(
  rawLabel: string,
  opts: { criteria?: string | null; instruction?: string | null; unit?: string | null; min?: number | null; max?: number | null }
): ImportDraftItem {
  let label = norm(rawLabel);
  const parsed = opts.criteria ? parseCriteria(opts.criteria) : null;
  let min = opts.min ?? parsed?.min ?? null;
  let max = opts.max ?? parsed?.max ?? null;
  let unit = opts.unit ?? parsed?.unit ?? null;
  // 基準列に数値が無ければ「電流値の測定（15A以下）」のようなラベル末尾の括弧書きから抽出
  if (min == null && max == null && !unit) {
    const pm = label.match(/[（(]([^（）()]{1,40})[）)]$/);
    const fromLabel = pm ? parseCriteria(pm[1]) : null;
    if (pm && fromLabel) {
      min = fromLabel.min;
      max = fromLabel.max;
      unit = fromLabel.unit;
      label = norm(label.slice(0, pm.index));
    }
  }
  const numeric = min != null || max != null || !!unit;
  // 数値として読み取れなかった基準表記は点検方法欄に残して情報を落とさない
  const instructionParts = [norm(opts.instruction ?? "")];
  if (opts.criteria && !parsed) instructionParts.push(`基準: ${norm(opts.criteria)}`);
  const instruction = instructionParts.filter(Boolean).join(" / ");
  const itemType = guessItemType(label, numeric);
  return {
    label: norm(label).slice(0, IMPORT_LIMITS.maxLabelLen),
    itemType,
    instruction: instruction ? instruction.slice(0, IMPORT_LIMITS.maxInstructionLen) : null,
    unit: itemType === "numeric" ? unit : null,
    minValue: itemType === "numeric" ? min : null,
    maxValue: itemType === "numeric" ? max : null,
  };
}

// ---- 表形式（Excel シート / CSV）の解析 ----

const LABEL_HEADER_RE = /^(点検項目|項目名?|チェック項目|点検内容|作業内容|確認項目|確認内容|点検箇所|内容)/;
const CRITERIA_HEADER_RE = /^(判定基準|基準値?|規格値?|管理値|良否基準)/;
const METHOD_HEADER_RE = /^(点検方法|確認方法|方法|要領|注意事項|処置)/;
const UNIT_HEADER_RE = /^単位/;
const MIN_HEADER_RE = /^(下限|最小|min)/i;
const MAX_HEADER_RE = /^(上限|最大|max)/i;
const TITLE_RE = /(点検表|点検チェック|チェックシート|チェックリスト|点検記録|点検基準)/;

/** 「1」「レ」「済」等、点検票の記入欄・番号だけのセルはラベルとして扱わない */
function isMeaningfulLabel(s: string): boolean {
  const t = norm(s);
  if (t.length < 2) return false;
  if (/^[\d\s.\-/年月日時分秒:件No№#]+$/.test(toHalfWidth(t))) return false;
  return true;
}

/**
 * 文字列グリッド（Excel シートまたは CSV）から手順書ドラフトを1つ抽出する。
 * ヘッダ行（「点検項目」等の列名）を探し、見つかればその列対応で、
 * 見つからなければ「テキストが最も多い列」をラベル列とみなして抽出する。
 */
export function parseGrid(
  grid: string[][],
  fallbackName: string,
  source: string
): ProcedureDraft | null {
  const rows = grid.map((r) => r.map(norm));

  // ヘッダ行の検出（先頭20行以内）
  let headerRowIdx = -1;
  let cols: { label: number; criteria: number; method: number; unit: number; min: number; max: number } | null = null;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const labelCol = rows[i].findIndex((c) => LABEL_HEADER_RE.test(c));
    if (labelCol < 0) continue;
    headerRowIdx = i;
    cols = {
      label: labelCol,
      criteria: rows[i].findIndex((c) => CRITERIA_HEADER_RE.test(c)),
      method: rows[i].findIndex((c) => METHOD_HEADER_RE.test(c)),
      unit: rows[i].findIndex((c) => UNIT_HEADER_RE.test(c)),
      min: rows[i].findIndex((c) => MIN_HEADER_RE.test(c)),
      max: rows[i].findIndex((c) => MAX_HEADER_RE.test(c)),
    };
    break;
  }

  // タイトルの推定: ヘッダ行より上（無ければ先頭3行）から「◯◯点検表」風のセルを探す
  let title: string | null = null;
  const titleScanEnd = headerRowIdx >= 0 ? headerRowIdx : Math.min(rows.length, 3);
  for (let i = 0; i < titleScanEnd && !title; i++) {
    const hit = rows[i].find((c) => c && TITLE_RE.test(c) && c.length <= 60);
    if (hit) title = hit;
  }

  const items: ImportDraftItem[] = [];
  const at = (row: string[], idx: number): string => (idx >= 0 ? row[idx] ?? "" : "");

  if (cols) {
    for (let i = headerRowIdx + 1; i < rows.length && items.length < IMPORT_LIMITS.maxItemsPerDraft; i++) {
      const row = rows[i];
      const label = at(row, cols.label);
      if (!isMeaningfulLabel(label)) continue;
      const minS = toHalfWidth(at(row, cols.min));
      const maxS = toHalfWidth(at(row, cols.max));
      items.push(
        buildItem(label, {
          criteria: at(row, cols.criteria) || null,
          instruction: at(row, cols.method) || null,
          unit: at(row, cols.unit) || null,
          min: /^[-+]?\d+(\.\d+)?$/.test(minS) ? Number(minS) : null,
          max: /^[-+]?\d+(\.\d+)?$/.test(maxS) ? Number(maxS) : null,
        })
      );
    }
  } else {
    // ヘッダ無し: 意味のあるテキストが最も多い列をラベル列とみなす
    const colCount = Math.max(0, ...rows.map((r) => r.length));
    let best = -1;
    let bestCount = 0;
    for (let c = 0; c < colCount; c++) {
      const count = rows.filter((r) => isMeaningfulLabel(r[c] ?? "")).length;
      if (count > bestCount) { best = c; bestCount = count; }
    }
    if (best >= 0 && bestCount >= 2) {
      for (const row of rows) {
        if (items.length >= IMPORT_LIMITS.maxItemsPerDraft) break;
        const label = row[best] ?? "";
        if (!isMeaningfulLabel(label)) continue;
        if (title && norm(label) === norm(title)) continue;
        items.push(buildItem(label, { criteria: row[best + 1] || null }));
      }
    }
  }

  if (items.length === 0) return null;
  return {
    name: norm(title ?? fallbackName).slice(0, IMPORT_LIMITS.maxNameLen),
    description: `「${source}」から取り込み`,
    source,
    items,
  };
}

// ---- Excel（.xlsx / .xlsm） ----

/* eslint-disable @typescript-eslint/no-explicit-any */
function cellText(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((t: any) => t.text ?? "").join("");
    if (v.text != null) return String(v.text);
    if (v.result != null) return cellText(v.result);
    if (v.formula != null) return "";
  }
  return String(v);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function parseExcel(buffer: Buffer, filename: string): Promise<ProcedureDraft[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const base = filename.replace(/\.[^.]+$/, "");
  const drafts: ProcedureDraft[] = [];
  const sheets = wb.worksheets.slice(0, IMPORT_LIMITS.maxSheets);
  for (const ws of sheets) {
    if (ws.state && ws.state !== "visible") continue;
    const grid: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cells[colNumber - 1] = cellText(cell.value);
      });
      grid[rowNumber - 1] = cells;
    });
    const compact = grid.filter((r) => r && r.some((c) => c && c.trim()));
    if (compact.length === 0) continue;
    const genericSheet = /^Sheet\s*\d*$/i.test(ws.name.trim());
    const fallbackName = genericSheet ? base : sheets.length > 1 ? `${base} ${ws.name}` : ws.name;
    const source = genericSheet ? filename : `${filename} / ${ws.name}`;
    const draft = parseGrid(compact, fallbackName, source);
    if (draft) drafts.push(draft);
  }
  return drafts;
}

// ---- CSV ----

/** RFC4180 風パーサ（EquipmentImportClient と同等。引用符内の改行・カンマ対応） */
export function parseCsvText(text: string): string[][] {
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

export function parseCsv(buffer: Buffer, filename: string): ProcedureDraft[] {
  let text = buffer.toString("utf-8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const grid = parseCsvText(text).filter((r) => r.some((c) => c.trim()));
  if (grid.length === 0) return [];
  const draft = parseGrid(grid, filename.replace(/\.[^.]+$/, ""), filename);
  return draft ? [draft] : [];
}

// ---- PDF ----

/** 箇条書き・番号付き行（「1. ○○」「・○○」等） */
const PDF_ITEM_RE = /^\s*(?:\d{1,3}\s*[.)．、）]|[・･◦●○◯■□☐☑✓✔]|[（(]\s*\d{1,3}\s*[)）])\s*(.+)$/;
/** 番号等が無い行でも点検項目らしい語を含めば拾う（フォールバック用） */
const INSPECT_WORD_RE = /(点検|確認|漏れ|漏洩|異音|異臭|振動|清掃|締|緩み|ゆるみ|給油|注油|油量|水量|液量|レベル|圧力|温度|電流|電圧|摩耗|亀裂|損傷|変形|汚れ|詰まり|作動|動作|表示|残量)/;

/**
 * pdf.js のテキスト片を Y 座標でグルーピングして行を復元する
 * （unpdf の extractText はページ内をスペース連結してしまい行構造が失われるため）。
 */
async function extractPdfLines(buffer: Buffer): Promise<string[]> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const lines: string[] = [];
  const pageCount = Math.min(pdf.numPages, 30);
  for (let p = 1; p <= pageCount; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const pieces = (tc.items as Array<{ str?: string; transform?: number[] }>)
      .filter((it) => typeof it.str === "string" && it.str.trim() && Array.isArray(it.transform))
      .map((it) => ({ x: it.transform![4], y: it.transform![5], s: it.str as string }));
    // 上から下、左から右の順に並べ、Y がほぼ同じ片を1行にまとめる
    pieces.sort((a, b) => b.y - a.y || a.x - b.x);
    let lineY: number | null = null;
    let cur: string[] = [];
    for (const piece of pieces) {
      if (lineY !== null && Math.abs(piece.y - lineY) > 4) {
        lines.push(cur.join(" "));
        cur = [];
        lineY = null;
      }
      if (lineY === null) lineY = piece.y;
      cur.push(piece.s);
    }
    if (cur.length) lines.push(cur.join(" "));
  }
  return lines.map(norm).filter(Boolean);
}

export async function parsePdf(buffer: Buffer, filename: string): Promise<ProcedureDraft[]> {
  const lines = await extractPdfLines(buffer);
  if (lines.length === 0) {
    throw new Error(
      "PDFからテキストを抽出できませんでした（スキャン画像のPDFは対応していません）"
    );
  }

  // タイトル: 「◯◯点検表」風の行 → 先頭行
  const title = lines.slice(0, 10).find((l) => TITLE_RE.test(l) && l.length <= 60) ?? lines[0].slice(0, 60);

  const items: ImportDraftItem[] = [];
  const push = (label: string, rest?: string) => {
    if (!isMeaningfulLabel(label)) return;
    if (items.length >= IMPORT_LIMITS.maxItemsPerDraft) return;
    items.push(buildItem(label, { criteria: rest || null }));
  };

  // まず箇条書き・番号付き行を抽出
  for (const line of lines) {
    const m = line.match(PDF_ITEM_RE);
    if (m) push(m[1]);
  }
  // 箇条書きがほぼ無いPDF（表レイアウト等）は、点検語を含む短めの行を項目とみなす
  if (items.length < 3) {
    items.length = 0;
    for (const line of lines) {
      if (line === title) continue;
      if (line.length < 3 || line.length > 80) continue;
      if (!INSPECT_WORD_RE.test(line)) continue;
      push(line);
    }
  }

  if (items.length === 0) return [];
  return [
    {
      name: norm(title).slice(0, IMPORT_LIMITS.maxNameLen) || filename.replace(/\.[^.]+$/, ""),
      description: `「${filename}」から取り込み`,
      source: filename,
      items,
    },
  ];
}

// ---- ディスパッチ ----

export async function parseImportFile(filename: string, buffer: Buffer): Promise<ProcedureDraft[]> {
  const ext = (filename.match(/\.([^.]+)$/)?.[1] ?? "").toLowerCase();
  switch (ext) {
    case "xlsx":
    case "xlsm":
      return parseExcel(buffer, filename);
    case "csv":
      return parseCsv(buffer, filename);
    case "pdf":
      return parsePdf(buffer, filename);
    case "xls":
      throw new Error("旧形式の .xls は取り込めません。Excelで .xlsx 形式に保存し直してください");
    default:
      throw new Error("対応していないファイル形式です（.xlsx / .xlsm / .csv / .pdf に対応）");
  }
}
