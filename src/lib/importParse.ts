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
  // 「0.4±0.05Mpa」のような中心値±公差（点検表で最も多い書き方）
  let m = s.match(new RegExp(`${NUM_RE}\\s*±\\s*${NUM_RE}(.*)$`));
  if (m) {
    const center = Number(m[1]);
    const tol = Math.abs(Number(m[2]));
    // 0.4-0.05 が 0.35000000000000003 になるため丸める
    const fix = (n: number) => Number(n.toFixed(10));
    return { min: fix(center - tol), max: fix(center + tol), unit: unitOf(m[3]) };
  }
  m = s.match(new RegExp(`${NUM_RE}\\s*~\\s*${NUM_RE}(.*)$`));
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
  opts: {
    criteria?: string | null;
    instruction?: string | null;
    unit?: string | null;
    min?: number | null;
    max?: number | null;
    /** 基準列が無い表で、項目名そのものから基準値を読み取る */
    scanLabel?: boolean;
    /** 「【数値記入】」や記録欄の単位から数値入力と判っている */
    forceNumeric?: boolean;
    /** 大分類・中分類（「日常点検 / エアー圧」など）。点検方法欄の先頭に残す */
    category?: string | null;
  }
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
  // 「流量検査圧 2.0kPa以上」のように項目名と基準が同じセルに書かれている表
  if (min == null && max == null && opts.scanLabel) {
    const fromLabel = parseCriteria(label);
    if (fromLabel) {
      min = fromLabel.min;
      max = fromLabel.max;
      // 記入欄に刷り込まれた単位のほうが確かなので、そちらを優先する
      unit = unit ?? fromLabel.unit;
    }
  }
  const numeric = min != null || max != null || !!unit || !!opts.forceNumeric;
  // 数値として読み取れなかった基準表記は点検方法欄に残して情報を落とさない
  const instructionParts = [norm(opts.category ?? ""), norm(opts.instruction ?? "")];
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
// 半角カナの帳票名（「設備点検ﾁｪｯｸｼｰﾄ」など）も拾う
const TITLE_RE = /(点検表|点検チェック|チェックシート|チェックリスト|ﾁｪｯｸｼｰﾄ|ﾁｪｯｸﾘｽﾄ|点検記録|点検基準)/;
/** 日々の記入欄（「日付」の右に 1〜31 が並ぶ）の見出し */
const RECORD_HEADER_RE = /^(日付|点検日|実施日|月日|記録|点検年月日)/;
/** 数値記入であることを表す注記（記入欄の書式指定） */
const NUMERIC_MARK_RE = /[【[（(]\s*数値記入\s*[】\])）]/;
/** 記入欄にあらかじめ刷り込まれた単位（「kPa」「A」「℃」など） */
const UNIT_CELL_RE = /^[a-zA-Zμ℃%°Ω/·²³㎜㎝㎡㎥]{1,6}$/;
/** 点検周期を表す大分類（日常点検 / 月点検 …）。手順書の分割に使う */
const FREQ_RE =
  /^(日常|毎日|始業|終業|日々|週|毎週|週次|月|毎月|月次|隔月|半期|四半期|年|毎年|年次|\d+[ヶヵかカ]?月|\d+年)\s*(点検|検査|確認|チェック)?$/;
/** 帳票の対象（設備名など）を示す見出しセル */
const SUBJECT_LABEL_RE = /^(設備名|機械名|装置名|機種名|対象設備|設備)$/;

/** 「1」「レ」「済」等、点検票の記入欄・番号だけのセルはラベルとして扱わない */
function isMeaningfulLabel(s: string): boolean {
  const t = norm(s);
  if (t.length < 2) return false;
  if (/^[\d\s.\-/年月日時分秒:件No№#]+$/.test(toHalfWidth(t))) return false;
  return true;
}

/**
 * 記録欄（「日付」の右に 1〜31 が並ぶ列群）の開始列を推定する。無ければ -1。
 * 記録欄は項目の情報ではないので、列見出しの探索範囲から外す。
 */
function detectRecordStart(header: string[]): number {
  const marked = header.findIndex((c) => RECORD_HEADER_RE.test(c ?? ""));
  if (marked >= 0) return marked + 1;
  for (let i = 0; i < header.length; i++) {
    let n = 0;
    while (i + n < header.length && toHalfWidth(header[i + n] ?? "").trim() === String(n + 1)) n++;
    if (n >= 5) return i;
  }
  return -1;
}

/**
 * 記録欄にあらかじめ単位（「kPa」等）が刷り込まれている行は数値記入欄。
 * 3セル以上が同じ単位表記なら、その単位を採用する。
 */
function recordUnit(row: string[], recordStart: number): string | null {
  if (recordStart < 0) return null;
  const vals = row.slice(recordStart).map((c) => norm(c ?? "")).filter(Boolean);
  if (vals.length < 3) return null;
  const first = vals[0];
  if (!UNIT_CELL_RE.test(first)) return null;
  return vals.every((v) => v === first) ? first : null;
}

/** 帳票の対象（設備名）を見出しセルの右隣から拾う */
function findSubject(rows: string[][], endRow: number): string | null {
  for (let i = 0; i < endRow; i++) {
    for (let c = 0; c < rows[i].length; c++) {
      if (!SUBJECT_LABEL_RE.test(rows[i][c] ?? "")) continue;
      const v = rows[i].slice(c + 1).find((x) => x && x.length >= 2 && x.length <= 60);
      if (v) return v;
    }
  }
  return null;
}

/**
 * 文字列グリッド（Excel シートまたは CSV）から手順書ドラフトを抽出する。
 * ヘッダ行（「点検項目」等の列名）を探し、見つかればその列対応で、
 * 見つからなければ「テキストが最も多い列」をラベル列とみなして抽出する。
 *
 * 「点検項目 | 中分類 | 点検内容・規格 | 日付 1 2 3 …」のような日本の点検表では
 * 左側の列が結合セルの大分類・中分類になっているため、
 * 実際に項目文が並ぶ列をラベル列、その左をカテゴリとして扱う。
 * 大分類が点検周期（日常点検 / 月点検）なら、周期ごとに手順書を分ける。
 */
export function parseGrid(
  grid: string[][],
  fallbackName: string,
  source: string
): ProcedureDraft[] {
  const rows = grid.map((r) => (r ?? []).map((c) => norm(c ?? "")));

  // ヘッダ行の検出（先頭20行以内）
  let headerRowIdx = -1;
  let recordStart = -1;
  let cols:
    | { label: number; criteria: number; method: number; unit: number; min: number; max: number; groups: number[] }
    | null = null;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const header = rows[i];
    const rs = detectRecordStart(header);
    const limit = rs > 0 ? rs : header.length;
    const below = rows.slice(i + 1);
    const density = (c: number) => below.filter((r) => isMeaningfulLabel(r[c] ?? "")).length;
    const cands: number[] = [];
    for (let c = 0; c < limit; c++) if (LABEL_HEADER_RE.test(header[c] ?? "")) cands.push(c);
    if (cands.length === 0) continue;
    // 見出しが複数ある表では、下に項目文が最も多く並ぶ列を本命のラベル列とする
    let labelCol = cands[0];
    let labelCount = -1;
    for (const c of cands) {
      const n = density(c);
      if (n > labelCount) { labelCount = n; labelCol = c; }
    }
    // ラベル列より左の、値がまばらに入る列＝結合セルの大分類・中分類
    const groups: number[] = [];
    for (let c = 0; c < labelCol; c++) {
      const n = density(c);
      if (n > 0 && n < labelCount) groups.push(c);
    }
    const find = (re: RegExp) => header.findIndex((c, ci) => ci !== labelCol && ci < limit && re.test(c ?? ""));
    headerRowIdx = i;
    recordStart = rs;
    cols = {
      label: labelCol,
      criteria: find(CRITERIA_HEADER_RE),
      method: find(METHOD_HEADER_RE),
      unit: find(UNIT_HEADER_RE),
      min: find(MIN_HEADER_RE),
      max: find(MAX_HEADER_RE),
      groups,
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
  const subject = findSubject(rows, titleScanEnd);

  // 大分類（あれば）ごとに項目を貯める。キー "" は分類なし。
  const buckets = new Map<string, ImportDraftItem[]>();
  const total = () => [...buckets.values()].reduce((n, v) => n + v.length, 0);
  const put = (bucket: string, item: ImportDraftItem) => {
    const arr = buckets.get(bucket) ?? [];
    arr.push(item);
    buckets.set(bucket, arr);
  };
  const at = (row: string[], idx: number): string => (idx >= 0 ? row[idx] ?? "" : "");

  if (cols) {
    // 結合セルは先頭行にしか値が無いので、直近の値を持ち回る
    const current = new Map<number, string>();
    for (let i = headerRowIdx + 1; i < rows.length && total() < IMPORT_LIMITS.maxItemsPerDraft; i++) {
      const row = rows[i];
      for (const g of cols.groups) {
        const v = at(row, g);
        if (isMeaningfulLabel(v)) current.set(g, v);
      }
      const raw = at(row, cols.label);
      if (!isMeaningfulLabel(raw)) continue;
      const forceNumeric = NUMERIC_MARK_RE.test(raw);
      const label = norm(raw.replace(new RegExp(NUMERIC_MARK_RE, "g"), " "));
      if (!isMeaningfulLabel(label)) continue;
      const minS = toHalfWidth(at(row, cols.min));
      const maxS = toHalfWidth(at(row, cols.max));
      const path = cols.groups.map((g) => current.get(g)).filter(Boolean) as string[];
      put(
        path[0] ?? "",
        buildItem(label, {
          criteria: at(row, cols.criteria) || null,
          instruction: at(row, cols.method) || null,
          unit: at(row, cols.unit) || recordUnit(row, recordStart) || null,
          min: /^[-+]?\d+(\.\d+)?$/.test(minS) ? Number(minS) : null,
          max: /^[-+]?\d+(\.\d+)?$/.test(maxS) ? Number(maxS) : null,
          scanLabel: cols.criteria < 0,
          forceNumeric: forceNumeric || !!recordUnit(row, recordStart),
          category: path.join(" / ") || null,
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
        if (total() >= IMPORT_LIMITS.maxItemsPerDraft) break;
        const label = row[best] ?? "";
        if (!isMeaningfulLabel(label)) continue;
        if (title && norm(label) === norm(title)) continue;
        put("", buildItem(label, { criteria: row[best + 1] || null }));
      }
    }
  }

  if (total() === 0) return [];

  // 大分類が点検周期（日常点検 / 月点検）なら周期ごとに手順書を分ける。
  // 周期は設備への割当（点検間隔）が別々になるため、1枚にまとめると運用できない。
  const keys = [...buckets.keys()];
  const splitByFreq = keys.length >= 2 && keys.every((k) => FREQ_RE.test(k));
  const base = norm(subject || title || fallbackName);

  if (splitByFreq) {
    return keys.map((k) => ({
      name: `${base} ${k}`.trim().slice(0, IMPORT_LIMITS.maxNameLen),
      description: `「${source}」から取り込み（${k}）`,
      source,
      items: buckets.get(k) ?? [],
    }));
  }
  const name = subject && title ? `${subject} ${title}` : base;
  return [
    {
      name: name.slice(0, IMPORT_LIMITS.maxNameLen),
      description: `「${source}」から取り込み`,
      source,
      items: [...buckets.values()].flat(),
    },
  ];
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

/** シート名付きのグリッド群を手順書ドラフトに変換する（.xlsx / .xls 共通）。 */
function sheetsToDrafts(sheets: { name: string; grid: string[][] }[], filename: string): ProcedureDraft[] {
  const base = filename.replace(/\.[^.]+$/, "");
  const drafts: ProcedureDraft[] = [];
  for (const sheet of sheets) {
    const compact = sheet.grid.filter((r) => r && r.some((c) => c && c.trim()));
    if (compact.length === 0) continue;
    const name = sheet.name.trim();
    const genericSheet = /^Sheet\s*\d*$/i.test(name);
    const fallbackName = genericSheet ? base : sheets.length > 1 ? `${base} ${name}` : name;
    const source = genericSheet ? filename : `${filename} / ${name}`;
    drafts.push(...parseGrid(compact, fallbackName, source));
  }
  return drafts;
}

export async function parseExcel(buffer: Buffer, filename: string): Promise<ProcedureDraft[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheets: { name: string; grid: string[][] }[] = [];
  for (const ws of wb.worksheets.slice(0, IMPORT_LIMITS.maxSheets)) {
    if (ws.state && ws.state !== "visible") continue;
    const grid: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        // ExcelJS は結合セルの子セルにも親の値を返す。そのままだと
        // 「日常点検」のような大分類が全行に埋まって項目名列と区別できないため、
        // 先頭セル以外は空にして SheetJS(.xls) と同じ形に揃える。
        if (cell.isMerged && cell.master && cell.master.address !== cell.address) {
          cells[colNumber - 1] = "";
          return;
        }
        cells[colNumber - 1] = cellText(cell.value);
      });
      grid[rowNumber - 1] = cells;
    });
    sheets.push({ name: ws.name, grid });
  }
  return sheetsToDrafts(sheets, filename);
}

// ---- 旧形式 Excel（.xls / BIFF） ----

/**
 * SheetJS(xlsx) は npm 公開が 0.18.5 で止まっており、細工したファイルで
 * プロトタイプ汚染が起きうる（CVE-2023-30533。修正版は CDN 配布のみ）。
 * 解析の前後で Object/Array.prototype に増えたプロパティを取り除き、
 * 汚染をリクエストの外へ持ち出さない。XLSX の読み取りは同期処理なので、
 * この区間に他のリクエストの処理が割り込むことはない。
 */
function withPrototypeGuard<T>(fn: () => T): T {
  const targets: object[] = [Object.prototype, Array.prototype];
  const before = targets.map((t) => new Set(Object.getOwnPropertyNames(t)));
  try {
    return fn();
  } finally {
    targets.forEach((t, i) => {
      for (const key of Object.getOwnPropertyNames(t)) {
        if (before[i].has(key)) continue;
        try {
          delete (t as Record<string, unknown>)[key];
        } catch {
          /* 消せなければ諦める（再定義不可なら書き換えも起きていない） */
        }
      }
    });
  }
}

/**
 * 旧形式の .xls（Excel 97-2003 / BIFF）を読む。ExcelJS は .xlsx 専用のため
 * SheetJS を使う。結合セルは先頭以外が空セルになるので、
 * parseGrid 側の大分類・中分類の持ち回りがそのまま効く。
 */
export async function parseXls(buffer: Buffer, filename: string): Promise<ProcedureDraft[]> {
  const XLSX = await import("xlsx");
  const sheets = withPrototypeGuard(() => {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true, cellFormula: false, cellHTML: false });
    const visible = (i: number) => (wb.Workbook?.Sheets?.[i]?.Hidden ?? 0) === 0;
    const out: { name: string; grid: string[][] }[] = [];
    wb.SheetNames.forEach((name, i) => {
      if (out.length >= IMPORT_LIMITS.maxSheets) return;
      if (!visible(i)) return;
      const ws = wb.Sheets[name];
      if (!ws) return;
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
      out.push({ name, grid: rows.map((r) => (r ?? []).map((c) => (c == null ? "" : String(c)))) });
    });
    return out;
  });
  return sheetsToDrafts(sheets, filename);
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
  return parseGrid(grid, filename.replace(/\.[^.]+$/, ""), filename);
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
    case "xls":
      return parseXls(buffer, filename);
    case "pdf":
      return parsePdf(buffer, filename);
    default:
      throw new Error("対応していないファイル形式です（.xlsx / .xlsm / .xls / .csv / .pdf に対応）");
  }
}
