import {
  EQUIPMENT_STATUS_LABEL,
  DUE_LEVEL_LABEL,
  RECORD_RESULT_LABEL,
  APPROVAL_STATUS_LABEL,
  ITEM_TYPE_LABEL,
  type EquipmentStatus,
  type CustomFieldDef,
  type InspectionRecord,
  type InspectionItemResult,
} from "./types";
import { dueLevel, daysUntil } from "./inspection";

/** 台帳出力（CSV / PDF印刷）に必要な1設備分のフィールド。 */
export interface LedgerRowInput {
  managementNo: string;
  name: string;
  category: string | null;
  maker: string | null;
  modelNo: string | null;
  serialNo: string | null;
  location: string | null;
  siteName?: string | null; // 工場名（listEquipment が JOIN で付加）
  areaName?: string | null; // 職場名（同上）
  status: EquipmentStatus;
  installedDate: string | null;
  nextDueDate: string | null; // 割当中の最短の次回点検日
  disposalDate: string | null;
  notes: string | null;
  customValues: Record<string, string>;
}

/** 固定列（列順はこの配列が唯一の正。カスタム項目列はこの後ろに動的追加）。 */
export const LEDGER_FIXED_HEADERS = [
  "管理番号",
  "設備名",
  "カテゴリ",
  "メーカー",
  "型式",
  "製造番号",
  "設置場所",
  "工場",
  "職場",
  "状態",
  "導入日",
  "次回点検日",
  "点検期限状態",
  "廃止日",
  "備考",
] as const;

/** CSVインポートで受け付ける固定列（この他にカスタム項目名のヘッダを任意で追加できる）。 */
export const LEDGER_IMPORT_HEADERS = [
  "管理番号",
  "設備名",
  "カテゴリ",
  "メーカー",
  "型式",
  "製造番号",
  "設置場所",
  "状態",
  "導入日",
  "備考",
] as const;

/** 固定列＋カスタム項目名の完全ヘッダ。 */
export function ledgerHeaders(defs: CustomFieldDef[]): string[] {
  return [...LEDGER_FIXED_HEADERS, ...defs.map((d) => d.name)];
}

/** 点検期限状態のラベル（残日数つき）。 */
export function dueStatusLabel(
  nextDueDate: string | null,
  today: string,
  soonDays = 30
): string {
  const lv = dueLevel(nextDueDate, today, soonDays);
  if (!nextDueDate) return DUE_LEVEL_LABEL.none;
  const d = daysUntil(nextDueDate, today);
  if (lv === "overdue") return `期限超過(${Math.abs(d)}日)`;
  if (lv === "soon") return `期限間近(あと${d}日)`;
  return DUE_LEVEL_LABEL.ok;
}

/** ledgerHeaders と同じ列順で1設備分のセル値を返す。CSV と PDF で共通利用。 */
export function ledgerCells(
  e: LedgerRowInput,
  defs: CustomFieldDef[],
  today: string,
  soonDays = 30
): (string | number | null)[] {
  return [
    e.managementNo,
    e.name,
    e.category,
    e.maker,
    e.modelNo,
    e.serialNo,
    e.location,
    e.siteName ?? null,
    e.areaName ?? null,
    EQUIPMENT_STATUS_LABEL[e.status],
    e.installedDate,
    e.nextDueDate,
    dueStatusLabel(e.nextDueDate, today, soonDays),
    e.disposalDate,
    e.notes,
    ...defs.map((d) => e.customValues[d.id] ?? null),
  ];
}

// ===== 点検記録CSV（1行 = 1項目結果のロング形式） =====

export const RECORD_CSV_HEADERS = [
  "点検日",
  "設備名",
  "管理番号",
  "手順書",
  "点検者",
  "総合結果",
  "承認状態",
  "承認者",
  "NG項目数",
  "項目名",
  "項目タイプ",
  "判定",
  "測定値",
  "単位",
  "下限",
  "上限",
  "コメント",
  "写真URL",
  "添付メディアURL",
] as const;

export function recordCsvCells(
  record: InspectionRecord,
  result: InspectionItemResult,
  /** 添付メディア（音声・動画等）の URL を `|` で連結した文字列（無ければ省略可） */
  mediaUrls?: string
): (string | number | null)[] {
  return [
    record.inspectionDate,
    record.equipmentName ?? "",
    record.managementNo ?? "",
    record.procedureName,
    record.inspector,
    RECORD_RESULT_LABEL[record.result],
    APPROVAL_STATUS_LABEL[record.approvalStatus],
    record.approverName ?? "",
    record.ngCount,
    result.itemLabel,
    ITEM_TYPE_LABEL[result.itemType],
    result.judgment === "ok" ? "OK" : result.judgment === "ng" ? "NG" : null,
    result.valueNumeric,
    result.unit,
    result.minValue,
    result.maxValue,
    result.valueText,
    result.photoUrl,
    mediaUrls || null,
  ];
}
