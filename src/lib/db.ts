import { getSql } from "./neon";
import { ensureSchema } from "./schema";
import { computeNextDueDate, todayJST, daysUntil } from "./inspection";
import type {
  Equipment,
  EquipmentStatus,
  CustomFieldDef,
  CustomFieldType,
  DocumentRow,
  DocType,
  InspectionProcedure,
  InspectionItem,
  ItemType,
  PhotoMode,
  EquipmentProcedure,
  InspectionRecord,
  InspectionItemResult,
  Judgment,
  RecordResult,
  ApprovalStatus,
  ActionStatus,
  CorrectiveAction,
  Site,
  Area,
  MediaType,
  ItemReferenceMedia,
  ResultMedia,
  EquipmentCondition,
} from "./types";
import type { ProcedureTemplate } from "./procedureTemplates";

// ===== row → camelCase マッパー =====
/* eslint-disable @typescript-eslint/no-explicit-any */

function dateStr(v: any): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.slice(0, 10);
  // pg ドライバは DATE を「ローカル深夜の Date」で返すため、toISOString(UTC) だと
  // タイムゾーン差で前日にずれる。ローカルの暦日要素から組み立てて日付ズレを防ぐ。
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v);
}
function tsStr(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}
function numOrNull(v: any): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapEquipment(r: any): Equipment {
  return {
    id: r.id,
    companyId: r.company_id,
    managementNo: r.management_no,
    name: r.name,
    category: r.category ?? null,
    maker: r.maker ?? null,
    modelNo: r.model_no ?? null,
    serialNo: r.serial_no ?? null,
    location: r.location ?? null,
    siteId: r.site_id ?? null,
    areaId: r.area_id ?? null,
    mapX: numOrNull(r.map_x),
    mapY: numOrNull(r.map_y),
    status: (r.status ?? "active") as EquipmentStatus,
    installedDate: dateStr(r.installed_date),
    disposalDate: dateStr(r.disposal_date),
    notes: r.notes ?? null,
    customValues: (r.custom_values ?? {}) as Record<string, string>,
    createdAt: tsStr(r.created_at),
    updatedAt: tsStr(r.updated_at),
    ...(r.site_name != null ? { siteName: r.site_name } : {}),
    ...(r.area_name != null ? { areaName: r.area_name } : {}),
  };
}

function mapCustomFieldDef(r: any): CustomFieldDef {
  return {
    id: r.id,
    name: r.name,
    fieldType: (r.field_type ?? "text") as CustomFieldType,
    options: Array.isArray(r.options) ? (r.options as string[]) : null,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function mapDocument(r: any): DocumentRow {
  return {
    id: r.id,
    equipmentId: r.equipment_id,
    docType: (r.doc_type ?? "other") as DocType,
    title: r.title,
    blobUrl: r.blob_url,
    fileName: r.file_name,
    contentType: r.content_type ?? null,
    sizeBytes: r.size_bytes != null ? Number(r.size_bytes) : null,
    uploadedAt: tsStr(r.uploaded_at),
  };
}

function mapProcedure(r: any): InspectionProcedure {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    archived: Boolean(r.archived),
    diagramUrl: r.diagram_url ?? null,
    createdAt: tsStr(r.created_at),
    updatedAt: tsStr(r.updated_at),
    ...(r.item_count != null ? { itemCount: Number(r.item_count) } : {}),
    ...(r.assigned_count != null ? { assignedCount: Number(r.assigned_count) } : {}),
    ...(r.record_count != null ? { recordCount: Number(r.record_count) } : {}),
  };
}

function mapItem(r: any): InspectionItem {
  return {
    id: r.id,
    procedureId: r.procedure_id,
    sortOrder: Number(r.sort_order ?? 0),
    label: r.label,
    itemType: (r.item_type ?? "ok_ng") as ItemType,
    instruction: r.instruction ?? null,
    unit: r.unit ?? null,
    minValue: numOrNull(r.min_value),
    maxValue: numOrNull(r.max_value),
    photoMode: (r.photo_mode ?? "none") as PhotoMode,
    requireCommentOnNg: Boolean(r.require_comment_on_ng),
    spotPhotoUrl: r.spot_photo_url ?? null,
    mapX: numOrNull(r.map_x),
    mapY: numOrNull(r.map_y),
    archived: Boolean(r.archived),
    updatedAt: tsStr(r.updated_at),
  };
}

function mapAssignment(r: any): EquipmentProcedure {
  return {
    id: r.id,
    equipmentId: r.equipment_id,
    procedureId: r.procedure_id,
    intervalMonths: r.interval_months ?? null,
    intervalDays: r.interval_days ?? null,
    lastInspectedDate: dateStr(r.last_inspected_date),
    nextDueDate: dateStr(r.next_due_date),
    ...(r.procedure_name != null ? { procedureName: r.procedure_name } : {}),
    ...(r.equipment_name != null ? { equipmentName: r.equipment_name } : {}),
    ...(r.management_no != null ? { managementNo: r.management_no } : {}),
    ...(r.equipment_status != null ? { equipmentStatus: r.equipment_status as EquipmentStatus } : {}),
    ...(r.item_count != null ? { itemCount: Number(r.item_count) } : {}),
    // equipment_site_id は SELECT した場合のみ載せる（null = 設備の工場未設定）
    ...(r.equipment_site_id !== undefined
      ? { equipmentSiteId: (r.equipment_site_id as string | null) ?? null }
      : {}),
  };
}

function mapRecord(r: any): InspectionRecord {
  return {
    id: r.id,
    equipmentId: r.equipment_id,
    procedureId: r.procedure_id ?? null,
    procedureName: r.procedure_name,
    inspectionDate: dateStr(r.inspection_date)!,
    inspector: r.inspector,
    inspectorUserId: r.inspector_user_id ?? null,
    result: (r.result ?? "pass") as RecordResult,
    ngCount: Number(r.ng_count ?? 0),
    notes: r.notes ?? null,
    createdAt: tsStr(r.created_at),
    approvalStatus: (r.approval_status ?? "approved") as ApprovalStatus,
    approverUserId: r.approver_user_id ?? null,
    approverName: r.approver_name ?? null,
    approvedAt: r.approved_at ? tsStr(r.approved_at) : null,
    reviewComment: r.review_comment ?? null,
    updatedAt: r.updated_at ? tsStr(r.updated_at) : null,
    ...(r.equipment_name != null ? { equipmentName: r.equipment_name } : {}),
    ...(r.management_no != null ? { managementNo: r.management_no } : {}),
  };
}

function mapItemResult(r: any): InspectionItemResult {
  return {
    id: r.id,
    recordId: r.record_id,
    itemId: r.item_id ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    itemLabel: r.item_label,
    itemType: (r.item_type ?? "ok_ng") as ItemType,
    judgment: (r.judgment ?? null) as Judgment | null,
    autoJudgment: (r.auto_judgment ?? null) as Judgment | null,
    valueNumeric: numOrNull(r.value_numeric),
    unit: r.unit ?? null,
    minValue: numOrNull(r.min_value),
    maxValue: numOrNull(r.max_value),
    valueText: r.value_text ?? null,
    photoUrl: r.photo_url ?? null,
    createdAt: tsStr(r.created_at),
  };
}

// ===== 設備（台帳） =====

export interface EquipmentInput {
  managementNo: string;
  name: string;
  category?: string | null;
  maker?: string | null;
  modelNo?: string | null;
  serialNo?: string | null;
  location?: string | null;
  siteId?: string | null;
  areaId?: string | null;
  status?: EquipmentStatus;
  installedDate?: string | null;
  disposalDate?: string | null;
  notes?: string | null;
  customValues?: Record<string, string>;
}

/** 台帳・記録系の工場/職場フィルタ */
export interface SiteFilters {
  siteId?: string;
  areaId?: string;
}

/** 台帳一覧（割当中の最短の次回点検日・工場/職場名も同時に取得）。検索語があれば名称/型番/管理番号/メーカー/設置場所で絞り込み。 */
export async function listEquipment(
  companyId: string,
  search?: string,
  filters: SiteFilters = {}
): Promise<Array<Equipment & { nextDueDate: string | null }>> {
  await ensureSchema();
  const sql = getSql();
  const like = search ? `%${search}%` : null;
  const rows = await sql`
    SELECT e.*, ep.next_due AS next_due, s.name AS site_name, a.name AS area_name
    FROM equipment e
    LEFT JOIN (
      SELECT equipment_id, MIN(next_due_date) AS next_due
      FROM equipment_procedures WHERE company_id = ${companyId}
      GROUP BY equipment_id
    ) ep ON ep.equipment_id = e.id
    LEFT JOIN sites s ON s.id = e.site_id
    LEFT JOIN areas a ON a.id = e.area_id
    WHERE e.company_id = ${companyId}
      AND (${like}::text IS NULL
           OR e.name ILIKE ${like} OR e.model_no ILIKE ${like}
           OR e.management_no ILIKE ${like} OR e.maker ILIKE ${like}
           OR e.location ILIKE ${like})
      AND (${filters.siteId ?? null}::uuid IS NULL OR e.site_id = ${filters.siteId ?? null}::uuid)
      AND (${filters.areaId ?? null}::uuid IS NULL OR e.area_id = ${filters.areaId ?? null}::uuid)
    ORDER BY ep.next_due ASC NULLS LAST, e.name ASC`;
  return rows.map((r: any) => ({
    ...mapEquipment(r),
    nextDueDate: dateStr(r.next_due),
  }));
}

export async function getEquipment(companyId: string, id: string): Promise<Equipment | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM equipment WHERE company_id = ${companyId} AND id = ${id} LIMIT 1`;
  return rows[0] ? mapEquipment(rows[0]) : null;
}

export async function getEquipmentByManagementNo(
  companyId: string,
  managementNo: string
): Promise<Equipment | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM equipment
    WHERE company_id = ${companyId} AND management_no = ${managementNo} LIMIT 1`;
  return rows[0] ? mapEquipment(rows[0]) : null;
}

export async function createEquipment(companyId: string, input: EquipmentInput): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  // status と 廃止日 を双方向で整合させる（廃止日あり ⇔ retired）。
  const disposalDate = input.disposalDate ?? (input.status === "retired" ? todayJST() : null);
  const status = disposalDate ? "retired" : (input.status ?? "active");
  const rows = await sql`
    INSERT INTO equipment (
      company_id, management_no, name, category, maker, model_no, serial_no,
      location, site_id, area_id, status, installed_date, disposal_date, notes, custom_values
    ) VALUES (
      ${companyId}, ${input.managementNo}, ${input.name}, ${input.category ?? null},
      ${input.maker ?? null}, ${input.modelNo ?? null}, ${input.serialNo ?? null},
      ${input.location ?? null},
      (SELECT id FROM sites WHERE id = ${input.siteId ?? null}::uuid AND company_id = ${companyId}),
      (SELECT id FROM areas WHERE id = ${input.areaId ?? null}::uuid
         AND site_id = ${input.siteId ?? null}::uuid AND company_id = ${companyId}),
      ${status}, ${input.installedDate ?? null},
      ${disposalDate}, ${input.notes ?? null},
      ${JSON.stringify(input.customValues ?? {})}::jsonb
    ) RETURNING id`;
  return rows[0].id as string;
}

export async function updateEquipment(
  companyId: string,
  id: string,
  input: EquipmentInput
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const disposalDate = input.disposalDate ?? (input.status === "retired" ? todayJST() : null);
  const status = disposalDate ? "retired" : (input.status ?? "active");
  await sql`
    UPDATE equipment SET
      management_no = ${input.managementNo},
      name = ${input.name},
      category = ${input.category ?? null},
      maker = ${input.maker ?? null},
      model_no = ${input.modelNo ?? null},
      serial_no = ${input.serialNo ?? null},
      location = ${input.location ?? null},
      -- 工場が変わったらマップ座標は無効（SET 式内の列参照は更新前の値）
      map_x = CASE WHEN equipment.site_id IS DISTINCT FROM ${input.siteId ?? null}::uuid THEN NULL ELSE map_x END,
      map_y = CASE WHEN equipment.site_id IS DISTINCT FROM ${input.siteId ?? null}::uuid THEN NULL ELSE map_y END,
      site_id = (SELECT id FROM sites WHERE id = ${input.siteId ?? null}::uuid AND company_id = ${companyId}),
      area_id = (SELECT id FROM areas WHERE id = ${input.areaId ?? null}::uuid
                   AND site_id = ${input.siteId ?? null}::uuid AND company_id = ${companyId}),
      status = ${status},
      installed_date = ${input.installedDate ?? null},
      disposal_date = ${disposalDate},
      notes = ${input.notes ?? null},
      custom_values = ${JSON.stringify(input.customValues ?? {})}::jsonb,
      updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${id}`;
}

/** 設備を廃止（ソフト）。点検記録・添付を保持したまま status=retired・廃止日をセット。 */
export async function disposeEquipment(
  companyId: string,
  id: string,
  date?: string
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const d = date ?? todayJST();
  await sql`
    UPDATE equipment SET disposal_date = ${d}, status = 'retired', updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${id}`;
}

/** 廃止を取り消して稼働中に戻す。 */
export async function restoreEquipment(companyId: string, id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE equipment SET disposal_date = NULL, status = 'active', updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${id}`;
}

/** 完全削除（設備・添付・割当・点検記録をすべて削除）。通常は廃止を推奨。 */
export async function deleteEquipment(companyId: string, id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM equipment WHERE company_id = ${companyId} AND id = ${id}`;
}

/** 設備の点検記録件数（完全削除の確認ダイアログ用）。 */
export async function countRecordsForEquipment(
  companyId: string,
  equipmentId: string
): Promise<number> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT COUNT(*) AS c FROM inspection_records
    WHERE company_id = ${companyId} AND equipment_id = ${equipmentId}`;
  return Number(rows[0].c);
}

/**
 * 設備に紐づく全 Blob URL（添付＋点検写真）。完全削除時に Vercel Blob からも消すために使う。
 */
export async function collectEquipmentBlobUrls(
  companyId: string,
  equipmentId: string
): Promise<string[]> {
  await ensureSchema();
  const sql = getSql();
  const docs = await sql`
    SELECT blob_url FROM documents
    WHERE company_id = ${companyId} AND equipment_id = ${equipmentId}`;
  const photos = await sql`
    SELECT ir.photo_url FROM inspection_item_results ir
    JOIN inspection_records r ON r.id = ir.record_id
    WHERE r.company_id = ${companyId} AND r.equipment_id = ${equipmentId}
      AND ir.photo_url IS NOT NULL`;
  const media = await sql`
    SELECT rm.url FROM result_media rm
    JOIN inspection_item_results ir ON ir.id = rm.item_result_id
    JOIN inspection_records r ON r.id = ir.record_id
    WHERE r.company_id = ${companyId} AND r.equipment_id = ${equipmentId}`;
  return [
    ...docs.map((r: any) => r.blob_url as string),
    ...photos.map((r: any) => r.photo_url as string),
    ...media.map((r: any) => r.url as string),
  ].filter(Boolean);
}

// ===== カスタム項目定義 =====

export interface CustomFieldDefInput {
  name: string;
  fieldType: CustomFieldType;
  options?: string[] | null;
}

export async function listCustomFieldDefs(companyId: string): Promise<CustomFieldDef[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM custom_field_defs
    WHERE company_id = ${companyId}
    ORDER BY sort_order ASC, created_at ASC`;
  return rows.map(mapCustomFieldDef);
}

export async function createCustomFieldDef(
  companyId: string,
  input: CustomFieldDefInput
): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const options =
    input.fieldType === "select" && input.options && input.options.length > 0
      ? JSON.stringify(input.options)
      : null;
  const rows = await sql`
    INSERT INTO custom_field_defs (company_id, name, field_type, options, sort_order)
    VALUES (
      ${companyId}, ${input.name}, ${input.fieldType}, ${options}::jsonb,
      COALESCE((SELECT MAX(sort_order) + 1 FROM custom_field_defs WHERE company_id = ${companyId}), 0)
    ) RETURNING id`;
  return rows[0].id as string;
}

export async function updateCustomFieldDef(
  companyId: string,
  id: string,
  input: CustomFieldDefInput
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const options =
    input.fieldType === "select" && input.options && input.options.length > 0
      ? JSON.stringify(input.options)
      : null;
  await sql`
    UPDATE custom_field_defs SET
      name = ${input.name}, field_type = ${input.fieldType}, options = ${options}::jsonb
    WHERE company_id = ${companyId} AND id = ${id}`;
}

/** 定義を削除し、既存設備の JSONB から孤児キーも掃除する。 */
export async function deleteCustomFieldDef(companyId: string, id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM custom_field_defs WHERE company_id = ${companyId} AND id = ${id}`;
  await sql`
    UPDATE equipment SET custom_values = custom_values - ${id}
    WHERE company_id = ${companyId} AND custom_values ? ${id}`;
}

/** 表示順の上下移動（隣接行と sort_order を交換）。 */
export async function moveCustomFieldDef(
  companyId: string,
  id: string,
  dir: "up" | "down"
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const defs = await listCustomFieldDefs(companyId);
  const idx = defs.findIndex((d) => d.id === id);
  if (idx < 0) return;
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= defs.length) return;
  const a = defs[idx];
  const b = defs[swapIdx];
  // 正規化した連番で入れ替え（同値 sort_order でも安定して動くように）
  await sql`UPDATE custom_field_defs SET sort_order = ${swapIdx} WHERE company_id = ${companyId} AND id = ${a.id}`;
  await sql`UPDATE custom_field_defs SET sort_order = ${idx} WHERE company_id = ${companyId} AND id = ${b.id}`;
}

// ===== 添付（写真・PDF） =====

export async function listDocuments(
  companyId: string,
  equipmentId: string
): Promise<DocumentRow[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM documents
    WHERE company_id = ${companyId} AND equipment_id = ${equipmentId}
    ORDER BY uploaded_at DESC`;
  return rows.map(mapDocument);
}

export interface DocumentInput {
  equipmentId: string;
  docType: DocType;
  title: string;
  blobUrl: string;
  fileName: string;
  contentType?: string | null;
  sizeBytes?: number | null;
}

export async function createDocument(companyId: string, input: DocumentInput): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO documents (
      company_id, equipment_id, doc_type, title, blob_url, file_name, content_type, size_bytes
    ) VALUES (
      ${companyId}, ${input.equipmentId}, ${input.docType}, ${input.title},
      ${input.blobUrl}, ${input.fileName}, ${input.contentType ?? null}, ${input.sizeBytes ?? null}
    ) RETURNING id`;
  return rows[0].id as string;
}

export async function getDocument(companyId: string, id: string): Promise<DocumentRow | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM documents WHERE company_id = ${companyId} AND id = ${id} LIMIT 1`;
  return rows[0] ? mapDocument(rows[0]) : null;
}

export async function deleteDocument(companyId: string, id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM documents WHERE company_id = ${companyId} AND id = ${id}`;
}

// ===== 点検手順書 =====

/** 手順書一覧（項目数・割当設備数・記録数付き）。既定ではアーカイブ済みを除く。 */
export async function listProcedures(
  companyId: string,
  opts?: { includeArchived?: boolean }
): Promise<InspectionProcedure[]> {
  await ensureSchema();
  const sql = getSql();
  const includeArchived = opts?.includeArchived ?? false;
  const rows = await sql`
    SELECT p.*,
      (SELECT COUNT(*) FROM inspection_items i
        WHERE i.procedure_id = p.id AND i.archived = false) AS item_count,
      (SELECT COUNT(*) FROM equipment_procedures ep WHERE ep.procedure_id = p.id) AS assigned_count,
      (SELECT COUNT(*) FROM inspection_records r WHERE r.procedure_id = p.id) AS record_count
    FROM inspection_procedures p
    WHERE p.company_id = ${companyId} AND (${includeArchived} OR p.archived = false)
    ORDER BY p.archived ASC, p.created_at DESC`;
  return rows.map(mapProcedure);
}

export async function getProcedure(
  companyId: string,
  id: string
): Promise<InspectionProcedure | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT p.*,
      (SELECT COUNT(*) FROM inspection_records r WHERE r.procedure_id = p.id) AS record_count
    FROM inspection_procedures p
    WHERE p.company_id = ${companyId} AND p.id = ${id} LIMIT 1`;
  return rows[0] ? mapProcedure(rows[0]) : null;
}

export async function createProcedure(
  companyId: string,
  input: { name: string; description?: string | null }
): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO inspection_procedures (company_id, name, description)
    VALUES (${companyId}, ${input.name}, ${input.description ?? null})
    RETURNING id`;
  return rows[0].id as string;
}

export async function updateProcedure(
  companyId: string,
  id: string,
  input: { name: string; description?: string | null }
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE inspection_procedures SET
      name = ${input.name}, description = ${input.description ?? null}, updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${id}`;
}

/**
 * 手順書の削除。点検記録から参照されている場合はアーカイブ（ソフト削除）し、
 * 参照ゼロなら物理削除する。どちらの場合も割当（equipment_procedures）は解除する。
 * @returns "archived" | "deleted"
 */
export async function deleteOrArchiveProcedure(
  companyId: string,
  id: string
): Promise<"archived" | "deleted"> {
  await ensureSchema();
  const sql = getSql();
  const refs = await sql`
    SELECT COUNT(*) AS c FROM inspection_records
    WHERE company_id = ${companyId} AND procedure_id = ${id}`;
  await sql`
    DELETE FROM equipment_procedures
    WHERE company_id = ${companyId} AND procedure_id = ${id}`;
  if (Number(refs[0].c) > 0) {
    await sql`
      UPDATE inspection_procedures SET archived = true, updated_at = NOW()
      WHERE company_id = ${companyId} AND id = ${id}`;
    return "archived";
  }
  await sql`
    DELETE FROM inspection_procedures WHERE company_id = ${companyId} AND id = ${id}`;
  return "deleted";
}

// ===== 点検項目 =====

export interface InspectionItemInput {
  procedureId: string;
  label: string;
  itemType: ItemType;
  instruction?: string | null;
  unit?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
  photoMode?: PhotoMode;
  requireCommentOnNg?: boolean;
}

/** 手順書の点検項目一覧（既定ではアーカイブ済みを除く）。 */
export async function listInspectionItems(
  companyId: string,
  procedureId: string,
  opts?: { includeArchived?: boolean }
): Promise<InspectionItem[]> {
  await ensureSchema();
  const sql = getSql();
  const includeArchived = opts?.includeArchived ?? false;
  const rows = await sql`
    SELECT * FROM inspection_items
    WHERE company_id = ${companyId} AND procedure_id = ${procedureId}
      AND (${includeArchived} OR archived = false)
    ORDER BY sort_order ASC, created_at ASC`;
  return rows.map(mapItem);
}

/** numeric 以外のタイプでは unit/min/max を落とし、photo タイプは常に写真必須にする。 */
function normalizeItemInput(input: InspectionItemInput): InspectionItemInput {
  const numeric = input.itemType === "numeric";
  return {
    ...input,
    unit: numeric ? input.unit ?? null : null,
    minValue: numeric ? input.minValue ?? null : null,
    maxValue: numeric ? input.maxValue ?? null : null,
    photoMode: input.itemType === "photo" ? "required" : input.photoMode ?? "none",
  };
}

export async function createInspectionItem(
  companyId: string,
  input: InspectionItemInput
): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const v = normalizeItemInput(input);
  const rows = await sql`
    INSERT INTO inspection_items (
      company_id, procedure_id, sort_order, label, item_type, instruction,
      unit, min_value, max_value, photo_mode, require_comment_on_ng
    ) VALUES (
      ${companyId}, ${v.procedureId},
      COALESCE((SELECT MAX(sort_order) + 1 FROM inspection_items
                WHERE company_id = ${companyId} AND procedure_id = ${v.procedureId}), 0),
      ${v.label}, ${v.itemType}, ${v.instruction ?? null},
      ${v.unit}, ${v.minValue}, ${v.maxValue},
      ${v.photoMode}, ${v.requireCommentOnNg ?? false}
    ) RETURNING id`;
  await sql`
    UPDATE inspection_procedures SET updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${v.procedureId}`;
  return rows[0].id as string;
}

export async function updateInspectionItem(
  companyId: string,
  id: string,
  input: InspectionItemInput
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const v = normalizeItemInput(input);
  await sql`
    UPDATE inspection_items SET
      label = ${v.label},
      item_type = ${v.itemType},
      instruction = ${v.instruction ?? null},
      unit = ${v.unit},
      min_value = ${v.minValue},
      max_value = ${v.maxValue},
      photo_mode = ${v.photoMode},
      require_comment_on_ng = ${v.requireCommentOnNg ?? false},
      updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${id}`;
  await sql`
    UPDATE inspection_procedures SET updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${v.procedureId}`;
}

/**
 * 点検項目の削除。結果から参照されている場合はアーカイブ、参照ゼロなら物理削除。
 * @returns "archived" | "deleted"
 */
export async function deleteOrArchiveInspectionItem(
  companyId: string,
  id: string,
  procedureId: string
): Promise<"archived" | "deleted"> {
  await ensureSchema();
  const sql = getSql();
  const refs = await sql`
    SELECT COUNT(*) AS c FROM inspection_item_results
    WHERE company_id = ${companyId} AND item_id = ${id}`;
  if (Number(refs[0].c) > 0) {
    await sql`
      UPDATE inspection_items SET archived = true, updated_at = NOW()
      WHERE company_id = ${companyId} AND id = ${id}`;
  } else {
    await sql`DELETE FROM inspection_items WHERE company_id = ${companyId} AND id = ${id}`;
  }
  await sql`
    UPDATE inspection_procedures SET updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${procedureId}`;
  return Number(refs[0].c) > 0 ? "archived" : "deleted";
}

/** 項目の上下移動（表示順を正規化した連番で入れ替え）。 */
export async function moveInspectionItem(
  companyId: string,
  id: string,
  procedureId: string,
  dir: "up" | "down"
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const items = await listInspectionItems(companyId, procedureId);
  const idx = items.findIndex((i) => i.id === id);
  if (idx < 0) return;
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= items.length) return;
  const a = items[idx];
  const b = items[swapIdx];
  await sql`UPDATE inspection_items SET sort_order = ${swapIdx} WHERE company_id = ${companyId} AND id = ${a.id}`;
  await sql`UPDATE inspection_items SET sort_order = ${idx} WHERE company_id = ${companyId} AND id = ${b.id}`;
}

// ===== 割当（点検スケジュール） =====

export interface AssignmentInput {
  equipmentId: string;
  procedureId: string;
  intervalMonths?: number | null;
  intervalDays?: number | null;
  /** 導入時の移行用: 最終点検日（次回日はここから周期計算） */
  lastInspectedDate?: string | null;
  /** 導入時の移行用: 次回点検日の直接指定（最優先） */
  nextDueDate?: string | null;
}

/** 設備に割当済みの手順書一覧（手順書名・項目数付き。アーカイブ済み手順書は割当時点で解除されるため通常は現れない）。 */
export async function listAssignmentsForEquipment(
  companyId: string,
  equipmentId: string
): Promise<EquipmentProcedure[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT ep.*, p.name AS procedure_name,
      (SELECT COUNT(*) FROM inspection_items i
        WHERE i.procedure_id = ep.procedure_id AND i.archived = false) AS item_count
    FROM equipment_procedures ep
    JOIN inspection_procedures p ON p.id = ep.procedure_id
    WHERE ep.company_id = ${companyId} AND ep.equipment_id = ${equipmentId}
    ORDER BY ep.next_due_date ASC NULLS LAST, p.name ASC`;
  return rows.map(mapAssignment);
}

/** 期限順の全割当（/schedule・ダッシュボード・Cron 用）。休止中・廃止設備は除く。 */
export async function listAssignmentsDue(
  companyId: string,
  filters: SiteFilters = {}
): Promise<EquipmentProcedure[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT ep.*, p.name AS procedure_name,
      e.name AS equipment_name, e.management_no, e.status AS equipment_status
    FROM equipment_procedures ep
    JOIN inspection_procedures p ON p.id = ep.procedure_id
    JOIN equipment e ON e.id = ep.equipment_id
    WHERE ep.company_id = ${companyId}
      AND e.status <> 'retired' AND e.status <> 'stopped'
      AND (${filters.siteId ?? null}::uuid IS NULL OR e.site_id = ${filters.siteId ?? null}::uuid)
      AND (${filters.areaId ?? null}::uuid IS NULL OR e.area_id = ${filters.areaId ?? null}::uuid)
    ORDER BY ep.next_due_date ASC NULLS LAST, e.name ASC`;
  return rows.map(mapAssignment);
}

/** 割当1件（ウィザード用に設備名・手順書名付き）。 */
export async function getAssignment(
  companyId: string,
  id: string
): Promise<EquipmentProcedure | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT ep.*, p.name AS procedure_name,
      e.name AS equipment_name, e.management_no, e.status AS equipment_status
    FROM equipment_procedures ep
    JOIN inspection_procedures p ON p.id = ep.procedure_id
    JOIN equipment e ON e.id = ep.equipment_id
    WHERE ep.company_id = ${companyId} AND ep.id = ${id} LIMIT 1`;
  return rows[0] ? mapAssignment(rows[0]) : null;
}

export async function assignProcedure(companyId: string, input: AssignmentInput): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const nextDue =
    input.nextDueDate ??
    computeNextDueDate(
      input.lastInspectedDate ?? todayJST(),
      input.intervalMonths ?? null,
      input.intervalDays ?? null
    );
  try {
    // INSERT ... SELECT で設備・手順書の両方が自社所有のときだけ行を作る
    // （FK は「存在」しか保証しないため、他社 ID の差し込みをここで遮断する）。
    const rows = await sql`
      INSERT INTO equipment_procedures (
        company_id, equipment_id, procedure_id, interval_months, interval_days,
        last_inspected_date, next_due_date
      )
      SELECT ${companyId}, e.id, p.id,
        ${input.intervalMonths ?? null}, ${input.intervalDays ?? null},
        ${input.lastInspectedDate ?? null}, ${nextDue}
      FROM equipment e
      JOIN inspection_procedures p
        ON p.id = ${input.procedureId} AND p.company_id = ${companyId} AND p.archived = false
      WHERE e.id = ${input.equipmentId} AND e.company_id = ${companyId}
      RETURNING id`;
    if (!rows[0]) throw new Error("設備または手順書が見つかりません");
    return rows[0].id as string;
  } catch (e: any) {
    const code = e?.code ?? e?.sourceError?.code;
    if (code === "23505") throw new Error("この手順書は既にこの設備へ割当済みです");
    throw e;
  }
}

export async function updateAssignment(
  companyId: string,
  id: string,
  input: Pick<AssignmentInput, "intervalMonths" | "intervalDays" | "lastInspectedDate" | "nextDueDate">
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const cur = await getAssignment(companyId, id);
  if (!cur) throw new Error("割当が見つかりません");
  const lastInspected = input.lastInspectedDate ?? cur.lastInspectedDate;
  const nextDue =
    input.nextDueDate ??
    computeNextDueDate(
      lastInspected ?? todayJST(),
      input.intervalMonths ?? null,
      input.intervalDays ?? null
    );
  await sql`
    UPDATE equipment_procedures SET
      interval_months = ${input.intervalMonths ?? null},
      interval_days = ${input.intervalDays ?? null},
      last_inspected_date = ${lastInspected},
      next_due_date = ${nextDue}
    WHERE company_id = ${companyId} AND id = ${id}`;
}

export async function unassignProcedure(companyId: string, id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM equipment_procedures WHERE company_id = ${companyId} AND id = ${id}`;
}

// ===== 点検記録 =====

export interface ResultMediaInput {
  mediaType: MediaType;
  url: string;
  durationSeconds?: number | null;
  note?: string | null;
}

export interface ItemResultInput {
  itemId: string | null;
  sortOrder: number;
  itemLabel: string;
  itemType: ItemType;
  judgment: Judgment | null;
  autoJudgment: Judgment | null;
  valueNumeric: number | null;
  unit: string | null;
  minValue: number | null;
  maxValue: number | null;
  valueText: string | null;
  photoUrl: string | null;
  /** 追加の記録メディア（写真・音声・動画。任意複数） */
  media?: ResultMediaInput[];
}

export interface InspectionRecordInput {
  equipmentId: string;
  procedureId: string;
  procedureName: string;
  inspectionDate: string;
  inspector: string;
  inspectorUserId: string | null;
  result: RecordResult;
  ngCount: number;
  notes: string | null;
  results: ItemResultInput[];
  /** 割当の last/next 更新用 */
  assignmentId: string;
  nextDueDate: string | null;
  /** 冪等キー（再送の二重登録防止。company_id と組で部分ユニーク） */
  clientKey?: string | null;
}

/**
 * 点検記録の保存（本モジュールの中核）。
 * record + 項目結果 + 割当の点検日更新を 1 バッチで実行し、部分保存を防ぐ。
 * HTTP ドライバの sql.transaction は RETURNING を後続文で使えないため、
 * record の id はサーバー側で事前生成して明示 INSERT する。
 */
export async function createInspectionRecord(
  companyId: string,
  input: InspectionRecordInput
): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const recordId = crypto.randomUUID();
  // HTTP ドライバは RETURNING を後続文で使えないため、項目結果の id も事前生成して
  // result_media を同一バッチに含める（部分保存なしの原子性を維持）。
  const resultsWithIds = input.results.map((r) => ({ ...r, resultId: crypto.randomUUID() }));
  await sql.transaction([
    sql`
      INSERT INTO inspection_records (
        id, company_id, equipment_id, procedure_id, procedure_name,
        inspection_date, inspector, inspector_user_id, result, ng_count, notes,
        client_key, approval_status
      ) VALUES (
        ${recordId}, ${companyId}, ${input.equipmentId}, ${input.procedureId},
        ${input.procedureName}, ${input.inspectionDate}, ${input.inspector},
        ${input.inspectorUserId}, ${input.result}, ${input.ngCount}, ${input.notes},
        ${input.clientKey ?? null}, 'pending'
      )`,
    ...resultsWithIds.map(
      (r) => sql`
        INSERT INTO inspection_item_results (
          id, company_id, record_id, item_id, sort_order, item_label, item_type,
          judgment, auto_judgment, value_numeric, unit, min_value, max_value,
          value_text, photo_url
        ) VALUES (
          ${r.resultId}, ${companyId}, ${recordId}, ${r.itemId}, ${r.sortOrder}, ${r.itemLabel},
          ${r.itemType}, ${r.judgment}, ${r.autoJudgment}, ${r.valueNumeric},
          ${r.unit}, ${r.minValue}, ${r.maxValue}, ${r.valueText}, ${r.photoUrl}
        )`
    ),
    ...resultsWithIds.flatMap((r) =>
      (r.media ?? []).map(
        (m, i) => sql`
          INSERT INTO result_media (
            company_id, item_result_id, media_type, url, duration_seconds, note, sort_order
          ) VALUES (
            ${companyId}, ${r.resultId}, ${m.mediaType}, ${m.url},
            ${m.durationSeconds ?? null}, ${m.note ?? null}, ${i}
          )`
      )
    ),
    sql`
      UPDATE equipment_procedures SET
        last_inspected_date = ${input.inspectionDate},
        next_due_date = ${input.nextDueDate}
      WHERE company_id = ${companyId} AND id = ${input.assignmentId}`,
  ]);
  return recordId;
}

/** 冪等キーから既存の記録 ID を引く（再送の二重登録防止）。 */
export async function findRecordIdByClientKey(
  companyId: string,
  clientKey: string
): Promise<string | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id FROM inspection_records
    WHERE company_id = ${companyId} AND client_key = ${clientKey} LIMIT 1`;
  return rows[0] ? (rows[0].id as string) : null;
}

/**
 * 承認ルーティングの閲覧スコープ（管理者向け）。
 * 設定すると、承認待ち（pending）の記録は「提出者の指名承認者が未設定
 * （approver_login_id IS NULL）または自分の login_id と一致」するものだけに絞られる。
 * 提出者が特定できない記録（inspector_user_id なし・ユーザー削除済み）は指名なし扱いで表示する。
 * pending 以外の記録には影響しない。非管理者にはこのスコープを渡さない（従来どおり全件）。
 */
export interface ApprovalScope {
  loginId: string | null;
}

export interface RecordFilters {
  equipmentId?: string;
  procedureId?: string;
  result?: RecordResult;
  approvalStatus?: ApprovalStatus;
  from?: string;
  to?: string;
  limit?: number;
  siteId?: string;
  areaId?: string;
  /** 管理者の承認ルーティングスコープ（pending 記録の絞り込み）。 */
  approvalScope?: ApprovalScope | null;
}

/** 点検記録の横断一覧（設備名付き・フィルタ対応）。 */
export async function listRecords(
  companyId: string,
  filters: RecordFilters = {}
): Promise<InspectionRecord[]> {
  await ensureSchema();
  const sql = getSql();
  // 既定は一覧表示向けの 200。CSVエクスポートは明示的に大きな値を渡す（上限 10000）。
  const limit = Math.min(filters.limit ?? 200, 10000);
  // 承認ルーティング: スコープ指定時、pending 記録は「提出者の指名承認者が
  // 未設定 or 自分」のものだけ（提出者不明は指名なし扱い = 表示）。
  const scopeActive = filters.approvalScope != null;
  const scopeLoginId = filters.approvalScope?.loginId ?? null;
  const rows = await sql`
    SELECT r.*, e.name AS equipment_name, e.management_no
    FROM inspection_records r
    JOIN equipment e ON e.id = r.equipment_id
    WHERE r.company_id = ${companyId}
      AND (${filters.equipmentId ?? null}::uuid IS NULL OR r.equipment_id = ${filters.equipmentId ?? null}::uuid)
      AND (${filters.procedureId ?? null}::uuid IS NULL OR r.procedure_id = ${filters.procedureId ?? null}::uuid)
      AND (${filters.result ?? null}::text IS NULL OR r.result = ${filters.result ?? null})
      AND (${filters.approvalStatus ?? null}::text IS NULL OR r.approval_status = ${filters.approvalStatus ?? null})
      AND (${filters.from ?? null}::date IS NULL OR r.inspection_date >= ${filters.from ?? null}::date)
      AND (${filters.to ?? null}::date IS NULL OR r.inspection_date <= ${filters.to ?? null}::date)
      AND (${filters.siteId ?? null}::uuid IS NULL OR e.site_id = ${filters.siteId ?? null}::uuid)
      AND (${filters.areaId ?? null}::uuid IS NULL OR e.area_id = ${filters.areaId ?? null}::uuid)
      AND (${scopeActive}::boolean = false
           OR r.approval_status <> 'pending'
           OR NOT EXISTS (
                SELECT 1 FROM users su
                WHERE su.id = r.inspector_user_id
                  AND su.approver_login_id IS NOT NULL
                  AND su.approver_login_id IS DISTINCT FROM ${scopeLoginId}::text))
    ORDER BY r.inspection_date DESC, r.created_at DESC
    LIMIT ${limit}`;
  return rows.map(mapRecord);
}

export async function listRecordsForEquipment(
  companyId: string,
  equipmentId: string,
  limit = 50
): Promise<InspectionRecord[]> {
  return listRecords(companyId, { equipmentId, limit });
}

/** 記録＋項目別結果（詳細・印刷ページ用）。 */
export async function getRecordWithResults(
  companyId: string,
  recordId: string
): Promise<{ record: InspectionRecord; results: InspectionItemResult[] } | null> {
  await ensureSchema();
  const sql = getSql();
  const recRows = await sql`
    SELECT r.*, e.name AS equipment_name, e.management_no
    FROM inspection_records r
    JOIN equipment e ON e.id = r.equipment_id
    WHERE r.company_id = ${companyId} AND r.id = ${recordId} LIMIT 1`;
  if (!recRows[0]) return null;
  const resRows = await sql`
    SELECT * FROM inspection_item_results
    WHERE company_id = ${companyId} AND record_id = ${recordId}
    ORDER BY sort_order ASC, created_at ASC`;
  return { record: mapRecord(recRows[0]), results: resRows.map(mapItemResult) };
}

/** 記録を削除し、紐づいていた点検写真・メディアの Blob URL を返す（呼び出し側で Blob も削除）。 */
export async function deleteInspectionRecord(
  companyId: string,
  id: string
): Promise<string[]> {
  await ensureSchema();
  const sql = getSql();
  const photos = await sql`
    SELECT photo_url FROM inspection_item_results
    WHERE company_id = ${companyId} AND record_id = ${id} AND photo_url IS NOT NULL`;
  const media = await sql`
    SELECT rm.url FROM result_media rm
    JOIN inspection_item_results ir ON ir.id = rm.item_result_id
    WHERE ir.company_id = ${companyId} AND ir.record_id = ${id}`;
  await sql`DELETE FROM inspection_records WHERE company_id = ${companyId} AND id = ${id}`;
  return [
    ...photos.map((r: any) => r.photo_url as string),
    ...media.map((r: any) => r.url as string),
  ].filter(Boolean);
}

// ===== 点検承認ワークフロー =====

/**
 * 承認する（pending/returned → approved）。承認者を記録し approved_at を確定。
 * 状態遷移は WHERE で元状態を縛る（不正遷移は 0 行 = false）。
 */
export async function approveRecord(
  companyId: string,
  recordId: string,
  approverUserId: string | null,
  approverName: string
): Promise<boolean> {
  await ensureSchema();
  const sql = getSql();
  // pending のみ承認可能。差し戻された記録は先に再提出（returned→pending）が必要。
  // これにより承認はスケジュールに影響を与えない（実施時に前進済み／再提出時に復元済み）。
  const rows = await sql`
    UPDATE inspection_records SET
      approval_status = 'approved',
      approver_user_id = ${approverUserId},
      approver_name = ${approverName},
      approved_at = NOW(),
      review_comment = NULL,
      updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${recordId}
      AND approval_status = 'pending'
    RETURNING id`;
  return rows.length > 0;
}

/**
 * 差し戻す（pending → returned）。理由を review_comment に記録し、
 * 当該割当の次回予定を本日に戻して再点検対象にする（ユーザー選択の「実施済みにし差し戻しで戻す」）。
 */
export async function returnRecord(
  companyId: string,
  recordId: string,
  approverUserId: string | null,
  approverName: string,
  comment: string
): Promise<boolean> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    UPDATE inspection_records SET
      approval_status = 'returned',
      approver_user_id = ${approverUserId},
      approver_name = ${approverName},
      review_comment = ${comment},
      approved_at = NULL,
      updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${recordId}
      AND approval_status = 'pending'
    RETURNING equipment_id, procedure_id`;
  if (rows.length === 0) return false;
  const r = rows[0] as any;
  if (r.procedure_id) {
    await sql`
      UPDATE equipment_procedures SET next_due_date = ${todayJST()}
      WHERE company_id = ${companyId}
        AND equipment_id = ${r.equipment_id} AND procedure_id = ${r.procedure_id}`;
  }
  return true;
}

/**
 * 差し戻された記録を再提出する（returned → pending。再度承認待ちに戻す）。
 * 差し戻し時に本日へリセットした割当の次回予定を、この点検実施日の周期へ復元する
 * （return がスケジュールを戻したのを resubmit が元に戻す＝対称）。
 */
export async function resubmitRecord(companyId: string, recordId: string): Promise<boolean> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    UPDATE inspection_records SET
      approval_status = 'pending',
      approved_at = NULL,
      updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${recordId}
      AND approval_status = 'returned'
    RETURNING equipment_id, procedure_id, inspection_date`;
  if (rows.length === 0) return false;
  const r = rows[0] as any;
  if (r.procedure_id) {
    const ep = await sql`
      SELECT id, interval_months, interval_days FROM equipment_procedures
      WHERE company_id = ${companyId}
        AND equipment_id = ${r.equipment_id} AND procedure_id = ${r.procedure_id} LIMIT 1`;
    if (ep[0]) {
      const inspDate = dateStr(r.inspection_date)!;
      const next = computeNextDueDate(
        inspDate,
        ep[0].interval_months ?? null,
        ep[0].interval_days ?? null
      );
      await sql`
        UPDATE equipment_procedures
        SET last_inspected_date = ${inspDate}, next_due_date = ${next}
        WHERE company_id = ${companyId} AND id = ${ep[0].id}`;
    }
  }
  return true;
}

/**
 * 承認依頼メールの宛先。設定の approver_email（区切り文字で複数可）を優先し、
 * 未設定なら会社の全ユーザー宛（点検アラートと同じ挙動）。
 */
export async function listApproverEmails(companyId: string): Promise<string[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`SELECT approver_email FROM companies WHERE id = ${companyId} LIMIT 1`;
  const configured = String(rows[0]?.approver_email ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (configured.length > 0) return [...new Set(configured)];
  // email は任意項目（NULL 可）なので未登録ユーザーは宛先から除外
  const users = await sql`SELECT email FROM users WHERE company_id = ${companyId}`;
  return users.map((u: any) => (u.email as string | null) ?? "").filter(Boolean);
}

/**
 * 提出者の指名承認者（users.approver_login_id → その login_id を持つユーザー）の
 * メールアドレスを返す。指名なし・承認者未登録・メール未設定なら null
 * （呼び出し側は listApproverEmails にフォールバックする）。
 */
export async function designatedApproverEmailForUser(
  submitterUserId: string
): Promise<string | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT a.email
    FROM users s
    JOIN users a ON a.login_id = s.approver_login_id
    WHERE s.id = ${submitterUserId} AND s.approver_login_id IS NOT NULL
    LIMIT 1`;
  const email = (rows[0]?.email as string | null) ?? null;
  return email && email.trim() ? email.trim() : null;
}

/**
 * 承認/差し戻し操作の認可（承認ルーティング）。
 * - 非管理者: 従来どおり許可（挙動変更なし）。
 * - 管理者: 提出者（inspector_user_id）の指名承認者が未設定（NULL）か、
 *   自分の login_id と一致する場合のみ許可。提出者が特定できない記録は指名なし扱いで許可。
 */
export async function canActorApproveRecord(
  companyId: string,
  recordId: string,
  actorUserId: string
): Promise<boolean> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT a.role AS actor_role, a.login_id AS actor_login_id,
           su.approver_login_id AS submitter_approver
    FROM users a
    LEFT JOIN inspection_records r
      ON r.id = ${recordId} AND r.company_id = ${companyId}
    LEFT JOIN users su ON su.id = r.inspector_user_id
    WHERE a.id = ${actorUserId}
    LIMIT 1`;
  if (!rows[0]) return false;
  const r: any = rows[0];
  if ((r.actor_role as string) !== "admin") return true;
  const approver = (r.submitter_approver as string | null) ?? null;
  if (approver == null) return true;
  return approver === ((r.actor_login_id as string | null) ?? null);
}

/**
 * ポータル連携: 実会社（is_demo=false）の承認待ち点検記録の総数。
 * /api/approvals/summary が使う。
 */
export async function pendingRecordCountAllRealCompanies(): Promise<number> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT COUNT(*)::int AS n
    FROM inspection_records r
    JOIN companies c ON c.id = r.company_id
    WHERE r.approval_status = 'pending' AND c.is_demo = false`;
  return Number(rows[0]?.n ?? 0);
}

/**
 * ポータル連携: 実会社（is_demo=false）の承認待ち記録を一括で差し戻し（pending → returned）。
 * 差し戻し件数を返す。/api/approvals/reset が使う（UI は既存の returned 表示・再提出で扱える）。
 */
export async function resetPendingRecordsAllRealCompanies(): Promise<number> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    UPDATE inspection_records r SET
      approval_status = 'returned',
      approved_at = NULL,
      updated_at = NOW()
    FROM companies c
    WHERE c.id = r.company_id AND c.is_demo = false
      AND r.approval_status = 'pending'
    RETURNING r.id`;
  return rows.length;
}

// ===== 数値推移 =====

export interface NumericSeriesPoint {
  inspectionDate: string;
  valueNumeric: number;
  minValue: number | null;
  maxValue: number | null;
  unit: string | null;
}

/** ある設備×点検項目の数値推移（時系列昇順）。 */
export async function listNumericSeries(
  companyId: string,
  equipmentId: string,
  itemId: string
): Promise<NumericSeriesPoint[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT r.inspection_date, ir.value_numeric, ir.min_value, ir.max_value, ir.unit
    FROM inspection_item_results ir
    JOIN inspection_records r ON r.id = ir.record_id
    WHERE ir.company_id = ${companyId} AND r.equipment_id = ${equipmentId}
      AND ir.item_id = ${itemId} AND ir.value_numeric IS NOT NULL
    ORDER BY r.inspection_date ASC, r.created_at ASC`;
  return rows.map((r: any) => ({
    inspectionDate: dateStr(r.inspection_date)!,
    valueNumeric: Number(r.value_numeric),
    minValue: numOrNull(r.min_value),
    maxValue: numOrNull(r.max_value),
    unit: r.unit ?? null,
  }));
}

/** その設備の記録に登場した numeric 項目（推移グラフの選択肢）。 */
export async function listNumericItemsForEquipment(
  companyId: string,
  equipmentId: string
): Promise<Array<{ itemId: string; label: string; unit: string | null; count: number }>> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT ir.item_id, MAX(ir.item_label) AS label, MAX(ir.unit) AS unit, COUNT(*) AS c
    FROM inspection_item_results ir
    JOIN inspection_records r ON r.id = ir.record_id
    WHERE ir.company_id = ${companyId} AND r.equipment_id = ${equipmentId}
      AND ir.item_type = 'numeric' AND ir.item_id IS NOT NULL
      AND ir.value_numeric IS NOT NULL
    GROUP BY ir.item_id
    ORDER BY MAX(ir.item_label) ASC`;
  return rows.map((r: any) => ({
    itemId: r.item_id,
    label: r.label,
    unit: r.unit ?? null,
    count: Number(r.c),
  }));
}

// ===== 管理番号採番ルール =====

export interface ManagementNoSettings {
  prefix: string;
  digits: number;
  seq: number;
}

export async function getManagementNoSettings(companyId: string): Promise<ManagementNoSettings> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT management_no_prefix, management_no_digits, management_no_seq
    FROM companies WHERE id = ${companyId} LIMIT 1`;
  const r = rows[0];
  return {
    prefix: r?.management_no_prefix ?? "S",
    digits: r?.management_no_digits ?? 4,
    seq: r?.management_no_seq ?? 1,
  };
}

export async function updateManagementNoSettings(
  companyId: string,
  settings: ManagementNoSettings
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE companies SET
      management_no_prefix = ${settings.prefix},
      management_no_digits = ${settings.digits},
      management_no_seq = ${settings.seq}
    WHERE id = ${companyId}`;
}

// ===== 承認ワークフロー設定（承認者メール） =====

export interface ApprovalSettings {
  /** 点検完了→承認依頼の宛先。空なら会社の全ユーザーに通知 */
  approverEmail: string | null;
}

export async function getApprovalSettings(companyId: string): Promise<ApprovalSettings> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT approver_email FROM companies WHERE id = ${companyId} LIMIT 1`;
  const r = rows[0];
  return {
    approverEmail: r?.approver_email ?? null,
  };
}

export async function updateApprovalSettings(
  companyId: string,
  settings: ApprovalSettings
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE companies SET
      approver_email = ${settings.approverEmail}
    WHERE id = ${companyId}`;
}

// ===== 作業者（アプリ内名簿。アカウントとは独立） =====

export interface Worker {
  id: string;
  name: string;
  createdAt: string;
}

/** 会社の作業者一覧（登録順）。 */
export async function listWorkers(companyId: string): Promise<Worker[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, name, created_at FROM workers
    WHERE company_id = ${companyId}
    ORDER BY created_at ASC, name ASC`;
  return rows.map((r: any) => ({
    id: r.id as string,
    name: r.name as string,
    createdAt: String(r.created_at),
  }));
}

/** 作業者を追加。同名が既にあれば null を返す（重複登録しない）。 */
export async function createWorker(companyId: string, name: string): Promise<Worker | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO workers (company_id, name)
    VALUES (${companyId}, ${name})
    ON CONFLICT (company_id, name) DO NOTHING
    RETURNING id, name, created_at`;
  const r = rows[0];
  if (!r) return null;
  return { id: r.id as string, name: r.name as string, createdAt: String(r.created_at) };
}

/** 作業者を削除（過去の記録の氏名文字列はそのまま残る）。 */
export async function deleteWorker(companyId: string, id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM workers WHERE company_id = ${companyId} AND id = ${id}`;
}

/** 次の管理番号を採番（seq をアトミックにインクリメント）して文字列で返す。 */
export async function nextManagementNo(companyId: string): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    UPDATE companies
    SET management_no_seq = management_no_seq + 1
    WHERE id = ${companyId}
    RETURNING management_no_prefix, management_no_digits, management_no_seq - 1 AS used_seq`;
  const r = rows[0];
  if (!r) throw new Error("会社情報が見つかりません");
  const prefix: string = r.management_no_prefix ?? "S";
  const digits: number = r.management_no_digits ?? 4;
  const seq: number = Number(r.used_seq);
  return `${prefix}-${String(seq).padStart(digits, "0")}`;
}

// ===== CSV一括インポート =====

export interface BulkImportResult {
  success: number;
  skipped: number;
  errors: Array<{ row: number; managementNo: string; reason: string }>;
}

export async function bulkCreateEquipment(
  companyId: string,
  items: EquipmentInput[]
): Promise<BulkImportResult> {
  await ensureSchema();
  const sql = getSql();
  let success = 0;
  let skipped = 0;
  const errors: BulkImportResult["errors"] = [];

  for (let i = 0; i < items.length; i++) {
    const input = items[i];
    if (!input.managementNo || !input.name) {
      errors.push({ row: i + 2, managementNo: input.managementNo || "", reason: "管理番号と設備名は必須です" });
      continue;
    }
    try {
      const disposalDate = input.disposalDate ?? (input.status === "retired" ? todayJST() : null);
      const status = disposalDate ? "retired" : (input.status ?? "active");
      const inserted = await sql`
        INSERT INTO equipment (
          company_id, management_no, name, category, maker, model_no, serial_no,
          location, status, installed_date, disposal_date, notes, custom_values
        ) VALUES (
          ${companyId}, ${input.managementNo}, ${input.name}, ${input.category ?? null},
          ${input.maker ?? null}, ${input.modelNo ?? null}, ${input.serialNo ?? null},
          ${input.location ?? null}, ${status}, ${input.installedDate ?? null},
          ${disposalDate}, ${input.notes ?? null},
          ${JSON.stringify(input.customValues ?? {})}::jsonb
        ) ON CONFLICT (company_id, management_no) DO NOTHING
        RETURNING id`;
      // ON CONFLICT で挿入されなかった行（管理番号の重複）はスキップとして数える
      if (inserted.length > 0) success++;
      else skipped++;
    } catch {
      errors.push({ row: i + 2, managementNo: input.managementNo, reason: "登録に失敗しました" });
    }
  }
  return { success, skipped, errors };
}

// ===== ダッシュボード =====

/** ダッシュボード集計（設備総数・期限超過・期限間近・周期未設定・直近30日のNG・未完了処置）。 */
export async function dashboardCounts(
  companyId: string,
  today: string,
  soonDays: number,
  filters: SiteFilters = {},
  approvalScope: ApprovalScope | null = null
): Promise<{
  total: number;
  overdue: number;
  soon: number;
  unscheduled: number;
  recentNg: number;
  openActions: number;
  overdueActions: number;
  pendingApprovals: number;
}> {
  await ensureSchema();
  const sql = getSql();
  const soonBoundary = (() => {
    const d = new Date(Date.parse(today + "T00:00:00Z") + soonDays * 86_400_000);
    return d.toISOString().slice(0, 10);
  })();
  const ngSince = (() => {
    const d = new Date(Date.parse(today + "T00:00:00Z") - 30 * 86_400_000);
    return d.toISOString().slice(0, 10);
  })();
  const siteId = filters.siteId ?? null;
  const areaId = filters.areaId ?? null;
  // ダッシュボードの「稼働中設備」= 稼働中・修理中（休止中・廃止は除く）
  const eqRows = await sql`
    SELECT COUNT(*) FILTER (WHERE status NOT IN ('stopped', 'retired')) AS total
    FROM equipment WHERE company_id = ${companyId}
      AND (${siteId}::uuid IS NULL OR site_id = ${siteId}::uuid)
      AND (${areaId}::uuid IS NULL OR area_id = ${areaId}::uuid)`;
  // 期限集計は「稼働中・修理中」の設備×手順書割当が対象（休止・廃止は除く）
  const dueRows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE ep.next_due_date IS NOT NULL AND ep.next_due_date < ${today}) AS overdue,
      COUNT(*) FILTER (WHERE ep.next_due_date IS NOT NULL
                       AND ep.next_due_date >= ${today}
                       AND ep.next_due_date <= ${soonBoundary}) AS soon,
      COUNT(*) FILTER (WHERE ep.next_due_date IS NULL) AS unscheduled
    FROM equipment_procedures ep
    JOIN equipment e ON e.id = ep.equipment_id
    WHERE ep.company_id = ${companyId}
      AND e.status <> 'retired' AND e.status <> 'stopped'
      AND (${siteId}::uuid IS NULL OR e.site_id = ${siteId}::uuid)
      AND (${areaId}::uuid IS NULL OR e.area_id = ${areaId}::uuid)`;
  const ngRows = await sql`
    SELECT COUNT(*) AS c FROM inspection_records r
    JOIN equipment e ON e.id = r.equipment_id
    WHERE r.company_id = ${companyId} AND r.result = 'fail'
      AND r.inspection_date >= ${ngSince}
      AND (${siteId}::uuid IS NULL OR e.site_id = ${siteId}::uuid)
      AND (${areaId}::uuid IS NULL OR e.area_id = ${areaId}::uuid)`;
  const actionRows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE ca.status <> 'done') AS open_actions,
      COUNT(*) FILTER (WHERE ca.status <> 'done' AND ca.due_date IS NOT NULL AND ca.due_date < ${today}) AS overdue_actions
    FROM corrective_actions ca
    JOIN equipment e ON e.id = ca.equipment_id
    WHERE ca.company_id = ${companyId}
      AND (${siteId}::uuid IS NULL OR e.site_id = ${siteId}::uuid)
      AND (${areaId}::uuid IS NULL OR e.area_id = ${areaId}::uuid)`;
  // 承認ルーティング: 管理者にはスコープを渡し、自分宛て（指名なし含む）の承認待ちだけ数える
  const scopeActive = approvalScope != null;
  const scopeLoginId = approvalScope?.loginId ?? null;
  const approvalRows = await sql`
    SELECT COUNT(*) AS c FROM inspection_records r
    JOIN equipment e ON e.id = r.equipment_id
    WHERE r.company_id = ${companyId} AND r.approval_status = 'pending'
      AND (${siteId}::uuid IS NULL OR e.site_id = ${siteId}::uuid)
      AND (${areaId}::uuid IS NULL OR e.area_id = ${areaId}::uuid)
      AND (${scopeActive}::boolean = false
           OR NOT EXISTS (
                SELECT 1 FROM users su
                WHERE su.id = r.inspector_user_id
                  AND su.approver_login_id IS NOT NULL
                  AND su.approver_login_id IS DISTINCT FROM ${scopeLoginId}::text))`;
  const e: any = eqRows[0];
  const d: any = dueRows[0];
  const a: any = actionRows[0];
  return {
    total: Number(e.total),
    overdue: Number(d.overdue),
    soon: Number(d.soon),
    unscheduled: Number(d.unscheduled),
    recentNg: Number(ngRows[0].c),
    openActions: Number(a.open_actions),
    overdueActions: Number(a.overdue_actions),
    pendingApprovals: Number(approvalRows[0].c),
  };
}

// ===== 点検記録CSVエクスポート用 =====

/**
 * 複数記録の項目別結果を record_id ごとにまとめて取得（CSVエクスポートの N+1 回避用）。
 * @returns record_id → 項目別結果（sort_order 昇順）の Map
 */
export async function listItemResultsForRecords(
  companyId: string,
  recordIds: string[]
): Promise<Map<string, InspectionItemResult[]>> {
  const map = new Map<string, InspectionItemResult[]>();
  if (recordIds.length === 0) return map;
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM inspection_item_results
    WHERE company_id = ${companyId} AND record_id = ANY(${recordIds}::uuid[])
    ORDER BY record_id ASC, sort_order ASC, created_at ASC`;
  for (const r of rows) {
    const res = mapItemResult(r);
    const list = map.get(res.recordId);
    if (list) list.push(res);
    else map.set(res.recordId, [res]);
  }
  return map;
}

/** ある手順書が割り当てられている設備一覧（設備名・管理番号・状態・次回点検日付き。手順書エディタ用）。 */
export async function listAssignmentsForProcedure(
  companyId: string,
  procedureId: string
): Promise<EquipmentProcedure[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT ep.*, p.name AS procedure_name,
      e.name AS equipment_name, e.management_no, e.status AS equipment_status,
      e.site_id AS equipment_site_id
    FROM equipment_procedures ep
    JOIN inspection_procedures p ON p.id = ep.procedure_id
    JOIN equipment e ON e.id = ep.equipment_id
    WHERE ep.company_id = ${companyId} AND ep.procedure_id = ${procedureId}
    ORDER BY ep.next_due_date ASC NULLS LAST, e.name ASC`;
  return rows.map(mapAssignment);
}

// ===== 処置（NG項目への是正対応） =====

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapCorrectiveAction(r: any): CorrectiveAction {
  return {
    id: r.id,
    equipmentId: r.equipment_id,
    recordId: r.record_id ?? null,
    itemResultId: r.item_result_id ?? null,
    itemLabel: r.item_label ?? null,
    title: r.title,
    detail: r.detail ?? null,
    assignee: r.assignee ?? null,
    dueDate: dateStr(r.due_date),
    status: (r.status ?? "open") as ActionStatus,
    resolvedNote: r.resolved_note ?? null,
    resolvedAt: r.resolved_at ? tsStr(r.resolved_at) : null,
    createdAt: tsStr(r.created_at),
    updatedAt: tsStr(r.updated_at),
    ...(r.equipment_name != null ? { equipmentName: r.equipment_name } : {}),
    ...(r.management_no != null ? { managementNo: r.management_no } : {}),
  };
}

export interface CorrectiveActionInput {
  equipmentId: string;
  recordId?: string | null;
  itemResultId?: string | null;
  itemLabel?: string | null;
  title: string;
  detail?: string | null;
  assignee?: string | null;
  dueDate?: string | null;
}

export interface ActionFilters {
  equipmentId?: string;
  status?: ActionStatus;
  limit?: number;
  /** 工場スコープ（設備の site_id で絞り込み） */
  siteId?: string;
}

/** 処置一覧（設備名付き）。未完了は期限昇順 NULLS LAST、完了は新しい順。 */
export async function listCorrectiveActions(
  companyId: string,
  filters: ActionFilters = {}
): Promise<CorrectiveAction[]> {
  await ensureSchema();
  const sql = getSql();
  const limit = Math.min(filters.limit ?? 200, 500);
  const rows = await sql`
    SELECT ca.*, e.name AS equipment_name, e.management_no
    FROM corrective_actions ca
    JOIN equipment e ON e.id = ca.equipment_id
    WHERE ca.company_id = ${companyId}
      AND (${filters.equipmentId ?? null}::uuid IS NULL OR ca.equipment_id = ${filters.equipmentId ?? null}::uuid)
      AND (${filters.status ?? null}::text IS NULL OR ca.status = ${filters.status ?? null})
      AND (${filters.siteId ?? null}::uuid IS NULL OR e.site_id = ${filters.siteId ?? null}::uuid)
    ORDER BY CASE WHEN ca.status = 'done' THEN 1 ELSE 0 END,
             CASE WHEN ca.status = 'done' THEN NULL ELSE ca.due_date END ASC NULLS LAST,
             ca.resolved_at DESC NULLS LAST,
             ca.created_at DESC
    LIMIT ${limit}`;
  return rows.map(mapCorrectiveAction);
}

/** 設備別の処置（設備詳細カード用。既定は未完了のみ）。 */
export async function listActionsForEquipment(
  companyId: string,
  equipmentId: string,
  opts?: { includeDone?: boolean; limit?: number }
): Promise<CorrectiveAction[]> {
  await ensureSchema();
  const sql = getSql();
  const includeDone = opts?.includeDone ?? false;
  const limit = Math.min(opts?.limit ?? 50, 200);
  const rows = await sql`
    SELECT ca.*, e.name AS equipment_name, e.management_no
    FROM corrective_actions ca
    JOIN equipment e ON e.id = ca.equipment_id
    WHERE ca.company_id = ${companyId} AND ca.equipment_id = ${equipmentId}
      AND (${includeDone} OR ca.status <> 'done')
    ORDER BY ca.due_date ASC NULLS LAST, ca.created_at DESC
    LIMIT ${limit}`;
  return rows.map(mapCorrectiveAction);
}

/** 記録に紐づく処置（記録詳細で NG 行にリンク/バッジを出すため）。 */
export async function listActionsForRecord(
  companyId: string,
  recordId: string
): Promise<CorrectiveAction[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM corrective_actions
    WHERE company_id = ${companyId} AND record_id = ${recordId}
    ORDER BY created_at ASC`;
  return rows.map(mapCorrectiveAction);
}

export async function getCorrectiveAction(
  companyId: string,
  id: string
): Promise<CorrectiveAction | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT ca.*, e.name AS equipment_name, e.management_no
    FROM corrective_actions ca
    JOIN equipment e ON e.id = ca.equipment_id
    WHERE ca.company_id = ${companyId} AND ca.id = ${id} LIMIT 1`;
  return rows[0] ? mapCorrectiveAction(rows[0]) : null;
}

/** 起票。INSERT ... SELECT で設備の自社所有を検証（assignProcedure と同型）。 */
export async function createCorrectiveAction(
  companyId: string,
  input: CorrectiveActionInput
): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO corrective_actions (
      company_id, equipment_id, record_id, item_result_id, item_label,
      title, detail, assignee, due_date
    )
    SELECT ${companyId}, e.id, ${input.recordId ?? null}, ${input.itemResultId ?? null},
      ${input.itemLabel ?? null}, ${input.title}, ${input.detail ?? null},
      ${input.assignee ?? null}, ${input.dueDate ?? null}
    FROM equipment e
    WHERE e.id = ${input.equipmentId} AND e.company_id = ${companyId}
    RETURNING id`;
  if (!rows[0]) throw new Error("設備が見つかりません");
  return rows[0].id as string;
}

/** 内容更新（done への遷移は resolveCorrectiveAction 経由）。 */
export async function updateCorrectiveAction(
  companyId: string,
  id: string,
  input: Pick<CorrectiveActionInput, "title" | "detail" | "assignee" | "dueDate"> & {
    status: Extract<ActionStatus, "open" | "in_progress">;
  }
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE corrective_actions SET
      title = ${input.title},
      detail = ${input.detail ?? null},
      assignee = ${input.assignee ?? null},
      due_date = ${input.dueDate ?? null},
      status = ${input.status},
      updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${id}`;
}

/** 完了にする。 */
export async function resolveCorrectiveAction(
  companyId: string,
  id: string,
  resolvedNote: string | null
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE corrective_actions SET
      status = 'done', resolved_note = ${resolvedNote},
      resolved_at = NOW(), updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${id}`;
}

/** 完了取消（対応中に戻す。resolved_note は監査のため残す）。 */
export async function reopenCorrectiveAction(companyId: string, id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE corrective_actions SET
      status = 'in_progress', resolved_at = NULL, updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${id}`;
}

export async function deleteCorrectiveAction(companyId: string, id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM corrective_actions WHERE company_id = ${companyId} AND id = ${id}`;
}

/** 起票フォームのプリフィル用: NG 項目結果の文脈を companyId スコープで1発取得（URL 改ざん耐性）。 */
export async function getItemResultContext(
  companyId: string,
  itemResultId: string
): Promise<{
  itemResultId: string;
  recordId: string;
  equipmentId: string;
  equipmentName: string;
  managementNo: string;
  itemLabel: string;
  valueText: string | null;
  inspectionDate: string;
} | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT ir.id AS item_result_id, r.id AS record_id, r.equipment_id,
      e.name AS equipment_name, e.management_no, ir.item_label, ir.value_text,
      r.inspection_date
    FROM inspection_item_results ir
    JOIN inspection_records r ON r.id = ir.record_id
    JOIN equipment e ON e.id = r.equipment_id
    WHERE ir.company_id = ${companyId} AND ir.id = ${itemResultId} LIMIT 1`;
  const r: any = rows[0];
  if (!r) return null;
  return {
    itemResultId: r.item_result_id,
    recordId: r.record_id,
    equipmentId: r.equipment_id,
    equipmentName: r.equipment_name,
    managementNo: r.management_no,
    itemLabel: r.item_label,
    valueText: r.value_text ?? null,
    inspectionDate: dateStr(r.inspection_date)!,
  };
}

// ===== 手順書テンプレート =====

/**
 * テンプレートから手順書+項目を一括作成。
 * createInspectionRecord と同じく id を事前生成し sql.transaction で原子的に INSERT
 * （HTTP ドライバは RETURNING を後続文で使えないため）。
 */
export async function createProcedureFromTemplate(
  companyId: string,
  tpl: ProcedureTemplate
): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const procedureId = crypto.randomUUID();
  await sql.transaction([
    sql`
      INSERT INTO inspection_procedures (id, company_id, name, description)
      VALUES (${procedureId}, ${companyId}, ${tpl.name}, ${tpl.description})`,
    ...tpl.items.map((it, i) => {
      const numeric = it.itemType === "numeric";
      const photoMode = it.itemType === "photo" ? "required" : it.photoMode ?? "none";
      return sql`
        INSERT INTO inspection_items (
          company_id, procedure_id, sort_order, label, item_type, instruction,
          unit, min_value, max_value, photo_mode, require_comment_on_ng
        ) VALUES (
          ${companyId}, ${procedureId}, ${i}, ${it.label}, ${it.itemType},
          ${it.instruction ?? null},
          ${numeric ? it.unit ?? null : null},
          ${numeric ? it.min ?? null : null},
          ${numeric ? it.max ?? null : null},
          ${photoMode}, ${it.requireCommentOnNg ?? false}
        )`;
    }),
  ]);
  return procedureId;
}

// ===== 工場（サイト）・職場（エリア） =====

function mapSite(r: any): Site {
  return {
    id: r.id,
    name: r.name,
    mapImageUrl: r.map_image_url ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    ...(r.equipment_count != null ? { equipmentCount: Number(r.equipment_count) } : {}),
  };
}

function mapArea(r: any): Area {
  return {
    id: r.id,
    siteId: r.site_id,
    name: r.name,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

/** 工場一覧（設備数付き・sort順）。 */
export async function listSites(companyId: string): Promise<Site[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT s.*,
      (SELECT COUNT(*) FROM equipment e WHERE e.site_id = s.id AND e.status <> 'retired') AS equipment_count
    FROM sites s
    WHERE s.company_id = ${companyId}
    ORDER BY s.sort_order ASC, s.created_at ASC`;
  return rows.map(mapSite);
}

/** 工場一覧＋配下の職場（フィルタUI・設備フォーム用）。 */
export async function listSitesWithAreas(companyId: string): Promise<Site[]> {
  await ensureSchema();
  const sql = getSql();
  const [siteRows, areaRows] = await Promise.all([
    sql`SELECT * FROM sites WHERE company_id = ${companyId} ORDER BY sort_order ASC, created_at ASC`,
    sql`SELECT * FROM areas WHERE company_id = ${companyId} ORDER BY sort_order ASC, created_at ASC`,
  ]);
  const areasBySite = new Map<string, Area[]>();
  for (const r of areaRows) {
    const a = mapArea(r);
    if (!areasBySite.has(a.siteId)) areasBySite.set(a.siteId, []);
    areasBySite.get(a.siteId)!.push(a);
  }
  return siteRows.map((r: any) => ({ ...mapSite(r), areas: areasBySite.get(r.id) ?? [] }));
}

export async function getSite(companyId: string, id: string): Promise<Site | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM sites WHERE company_id = ${companyId} AND id = ${id} LIMIT 1`;
  return rows[0] ? mapSite(rows[0]) : null;
}

export async function createSite(companyId: string, input: { name: string }): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  try {
    const rows = await sql`
      INSERT INTO sites (company_id, name, sort_order)
      VALUES (
        ${companyId}, ${input.name},
        COALESCE((SELECT MAX(sort_order) + 1 FROM sites WHERE company_id = ${companyId}), 0)
      ) RETURNING id`;
    return rows[0].id as string;
  } catch (e: any) {
    const code = e?.code ?? e?.sourceError?.code;
    if (code === "23505") throw new Error("同じ名前の工場が既にあります");
    throw e;
  }
}

export async function updateSite(
  companyId: string,
  id: string,
  input: { name: string }
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE sites SET name = ${input.name}, updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${id}`;
}

/** マップ画像の設定/差替/解除。旧 URL を返す（呼び出し側で Blob 削除）。 */
export async function setSiteMapImage(
  companyId: string,
  id: string,
  url: string | null
): Promise<string | null> {
  await ensureSchema();
  const sql = getSql();
  const old = await sql`
    SELECT map_image_url FROM sites WHERE company_id = ${companyId} AND id = ${id} LIMIT 1`;
  await sql`
    UPDATE sites SET map_image_url = ${url}, updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${id}`;
  return (old[0]?.map_image_url as string | undefined) ?? null;
}

/** 工場の並び順の上下移動。 */
export async function moveSite(companyId: string, id: string, dir: "up" | "down"): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const sites = await listSites(companyId);
  const idx = sites.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sites.length) return;
  await sql`UPDATE sites SET sort_order = ${swapIdx} WHERE company_id = ${companyId} AND id = ${sites[idx].id}`;
  await sql`UPDATE sites SET sort_order = ${idx} WHERE company_id = ${companyId} AND id = ${sites[swapIdx].id}`;
}

/**
 * 工場を削除。マップ画像URLを返す（呼び出し側で Blob 削除）。
 * FK は SET NULL だが map 座標は残るため、配下設備の座標を明示クリアする。
 */
export async function deleteSite(companyId: string, id: string): Promise<string | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT map_image_url FROM sites WHERE company_id = ${companyId} AND id = ${id} LIMIT 1`;
  await sql`
    UPDATE equipment SET map_x = NULL, map_y = NULL
    WHERE company_id = ${companyId} AND site_id = ${id}`;
  await sql`DELETE FROM sites WHERE company_id = ${companyId} AND id = ${id}`;
  return (rows[0]?.map_image_url as string | undefined) ?? null;
}

export async function listAreas(companyId: string, siteId?: string): Promise<Area[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM areas
    WHERE company_id = ${companyId}
      AND (${siteId ?? null}::uuid IS NULL OR site_id = ${siteId ?? null}::uuid)
    ORDER BY sort_order ASC, created_at ASC`;
  return rows.map(mapArea);
}

export async function createArea(
  companyId: string,
  input: { siteId: string; name: string }
): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  try {
    const rows = await sql`
      INSERT INTO areas (company_id, site_id, name, sort_order)
      SELECT ${companyId}, s.id, ${input.name},
        COALESCE((SELECT MAX(sort_order) + 1 FROM areas WHERE site_id = s.id), 0)
      FROM sites s
      WHERE s.id = ${input.siteId} AND s.company_id = ${companyId}
      RETURNING id`;
    if (!rows[0]) throw new Error("工場が見つかりません");
    return rows[0].id as string;
  } catch (e: any) {
    const code = e?.code ?? e?.sourceError?.code;
    if (code === "23505") throw new Error("同じ名前の職場が既にあります");
    throw e;
  }
}

export async function updateArea(
  companyId: string,
  id: string,
  input: { name: string }
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE areas SET name = ${input.name}
    WHERE company_id = ${companyId} AND id = ${id}`;
}

export async function moveArea(
  companyId: string,
  id: string,
  siteId: string,
  dir: "up" | "down"
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const areas = await listAreas(companyId, siteId);
  const idx = areas.findIndex((a) => a.id === id);
  if (idx < 0) return;
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= areas.length) return;
  await sql`UPDATE areas SET sort_order = ${swapIdx} WHERE company_id = ${companyId} AND id = ${areas[idx].id}`;
  await sql`UPDATE areas SET sort_order = ${idx} WHERE company_id = ${companyId} AND id = ${areas[swapIdx].id}`;
}

export async function deleteArea(companyId: string, id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM areas WHERE company_id = ${companyId} AND id = ${id}`;
}

// ===== 設備のマップ配置 =====

/** ピン配置（0-100 に clamp）。null で未配置に戻す。 */
export async function updateEquipmentMapPosition(
  companyId: string,
  equipmentId: string,
  pos: { x: number; y: number } | null
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const x = pos ? clamp(pos.x) : null;
  const y = pos ? clamp(pos.y) : null;
  await sql`
    UPDATE equipment SET map_x = ${x}, map_y = ${y}, updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${equipmentId}`;
}

export interface MapEquipment {
  id: string;
  name: string;
  managementNo: string;
  status: EquipmentStatus;
  areaId: string | null;
  areaName: string | null;
  mapX: number | null;
  mapY: number | null;
  nextDueDate: string | null;
}

/** マップ表示用: その工場の設備（廃止除く）をピン座標・職場名・次回点検日付きで。 */
export async function listEquipmentForMap(
  companyId: string,
  siteId: string
): Promise<MapEquipment[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT e.id, e.name, e.management_no, e.status, e.area_id, e.map_x, e.map_y,
      a.name AS area_name, ep.next_due
    FROM equipment e
    LEFT JOIN areas a ON a.id = e.area_id
    LEFT JOIN (
      SELECT equipment_id, MIN(next_due_date) AS next_due
      FROM equipment_procedures WHERE company_id = ${companyId}
      GROUP BY equipment_id
    ) ep ON ep.equipment_id = e.id
    WHERE e.company_id = ${companyId} AND e.site_id = ${siteId} AND e.status <> 'retired'
    ORDER BY e.name ASC`;
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    managementNo: r.management_no,
    status: (r.status ?? "active") as EquipmentStatus,
    areaId: r.area_id ?? null,
    areaName: r.area_name ?? null,
    mapX: numOrNull(r.map_x),
    mapY: numOrNull(r.map_y),
    nextDueDate: dateStr(r.next_due),
  }));
}

// ===== 設備コンディション モニタリング =====

export interface MonitoringEquipment {
  id: string;
  name: string;
  managementNo: string;
  modelNo: string | null;
  status: EquipmentStatus;
  siteId: string | null;
  siteName: string | null;
  areaId: string | null;
  areaName: string | null;
  location: string | null;
  mapX: number | null;
  mapY: number | null;
  nextDueDate: string | null;
  lastInspectionDate: string | null;
  lastResult: RecordResult | null;
  condition: EquipmentCondition;
  /** 最新点検が NG の場合の NG 項目名（異常点検項目） */
  ngItemLabels: string[];
}

/**
 * モニタリング用の設備一覧。各設備の「最新点検の結果」「期限」「稼働状態」から
 * コンディション（異常/注意/正常/停止中）を導出し、異常時は NG 項目名も付ける。
 */
export async function listEquipmentMonitoring(
  companyId: string,
  filters: SiteFilters & { search?: string } = {}
): Promise<MonitoringEquipment[]> {
  await ensureSchema();
  const sql = getSql();
  const today = todayJST();
  const like = filters.search ? `%${filters.search}%` : null;
  const rows = await sql`
    SELECT e.id, e.name, e.management_no, e.model_no, e.status, e.location,
      e.site_id, e.area_id, e.map_x, e.map_y,
      s.name AS site_name, a.name AS area_name,
      ep.next_due,
      lr.id AS last_record_id, lr.inspection_date AS last_inspection_date, lr.result AS last_result
    FROM equipment e
    LEFT JOIN sites s ON s.id = e.site_id
    LEFT JOIN areas a ON a.id = e.area_id
    LEFT JOIN (
      SELECT equipment_id, MIN(next_due_date) AS next_due
      FROM equipment_procedures WHERE company_id = ${companyId}
      GROUP BY equipment_id
    ) ep ON ep.equipment_id = e.id
    LEFT JOIN LATERAL (
      SELECT id, inspection_date, result
      FROM inspection_records r
      WHERE r.company_id = ${companyId} AND r.equipment_id = e.id
      ORDER BY r.inspection_date DESC, r.created_at DESC
      LIMIT 1
    ) lr ON true
    WHERE e.company_id = ${companyId}
      AND (${filters.siteId ?? null}::uuid IS NULL OR e.site_id = ${filters.siteId ?? null}::uuid)
      AND (${filters.areaId ?? null}::uuid IS NULL OR e.area_id = ${filters.areaId ?? null}::uuid)
      AND (${like}::text IS NULL OR e.name ILIKE ${like} OR e.model_no ILIKE ${like}
           OR e.management_no ILIKE ${like} OR e.maker ILIKE ${like} OR e.location ILIKE ${like})
    ORDER BY e.name ASC`;

  // 異常設備の NG 項目ラベルを一括取得（N+1 回避）
  const failRecordIds = rows
    .filter((r: any) => r.last_result === "fail" && r.last_record_id)
    .map((r: any) => r.last_record_id as string);
  const ngByRecord = new Map<string, string[]>();
  if (failRecordIds.length > 0) {
    const ngRows = await sql`
      SELECT record_id, item_label FROM inspection_item_results
      WHERE company_id = ${companyId} AND record_id = ANY(${failRecordIds}::uuid[])
        AND judgment = 'ng'
      ORDER BY sort_order ASC`;
    for (const g of ngRows) {
      const rid = g.record_id as string;
      if (!ngByRecord.has(rid)) ngByRecord.set(rid, []);
      ngByRecord.get(rid)!.push(g.item_label as string);
    }
  }

  return rows.map((r: any) => {
    const status = (r.status ?? "active") as EquipmentStatus;
    const nextDueDate = dateStr(r.next_due);
    const lastResult = (r.last_result ?? null) as RecordResult | null;
    let condition: EquipmentCondition;
    if (status === "retired" || status === "stopped") condition = "stopped";
    else if (lastResult === "fail") condition = "abnormal";
    else if (nextDueDate != null && daysUntil(nextDueDate, today) < 0) condition = "warning";
    else condition = "normal";
    return {
      id: r.id,
      name: r.name,
      managementNo: r.management_no,
      modelNo: r.model_no ?? null,
      status,
      siteId: r.site_id ?? null,
      siteName: r.site_name ?? null,
      areaId: r.area_id ?? null,
      areaName: r.area_name ?? null,
      location: r.location ?? null,
      mapX: numOrNull(r.map_x),
      mapY: numOrNull(r.map_y),
      nextDueDate,
      lastInspectionDate: dateStr(r.last_inspection_date),
      lastResult,
      condition,
      ngItemLabels: r.last_record_id ? (ngByRecord.get(r.last_record_id) ?? []) : [],
    };
  });
}

// ===== 正常見本メディア・点検箇所写真 =====

function mapReferenceMedia(r: any): ItemReferenceMedia {
  return {
    id: r.id,
    itemId: r.item_id,
    mediaType: (r.media_type ?? "photo") as MediaType,
    url: r.url,
    contentType: r.content_type ?? null,
    sizeBytes: r.size_bytes != null ? Number(r.size_bytes) : null,
    durationSeconds: numOrNull(r.duration_seconds),
    caption: r.caption ?? null,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

export interface ItemReferenceMediaInput {
  itemId: string;
  mediaType: MediaType;
  url: string;
  contentType?: string | null;
  sizeBytes?: number | null;
  durationSeconds?: number | null;
  caption?: string | null;
}

export async function listItemReferenceMedia(
  companyId: string,
  itemId: string
): Promise<ItemReferenceMedia[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM item_reference_media
    WHERE company_id = ${companyId} AND item_id = ${itemId}
    ORDER BY sort_order ASC, created_at ASC`;
  return rows.map(mapReferenceMedia);
}

/** 手順書の全項目分の見本メディアを一括取得（item_id → media[] の Map。N+1 回避）。 */
export async function listReferenceMediaForProcedure(
  companyId: string,
  procedureId: string
): Promise<Map<string, ItemReferenceMedia[]>> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT m.* FROM item_reference_media m
    JOIN inspection_items i ON i.id = m.item_id
    WHERE m.company_id = ${companyId} AND i.procedure_id = ${procedureId}
    ORDER BY m.sort_order ASC, m.created_at ASC`;
  const map = new Map<string, ItemReferenceMedia[]>();
  for (const r of rows) {
    const m = mapReferenceMedia(r);
    if (!map.has(m.itemId)) map.set(m.itemId, []);
    map.get(m.itemId)!.push(m);
  }
  return map;
}

/** 見本メディアの追加（INSERT ... SELECT で項目の自社所有を検証＋件数上限）。 */
export async function addItemReferenceMedia(
  companyId: string,
  input: ItemReferenceMediaInput,
  maxPerItem: number
): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO item_reference_media (
      company_id, item_id, media_type, url, content_type, size_bytes,
      duration_seconds, caption, sort_order
    )
    SELECT ${companyId}, i.id, ${input.mediaType}, ${input.url},
      ${input.contentType ?? null}, ${input.sizeBytes ?? null},
      ${input.durationSeconds ?? null}, ${input.caption ?? null},
      COALESCE((SELECT MAX(sort_order) + 1 FROM item_reference_media WHERE item_id = i.id), 0)
    FROM inspection_items i
    WHERE i.id = ${input.itemId} AND i.company_id = ${companyId}
      AND (SELECT COUNT(*) FROM item_reference_media WHERE item_id = i.id) < ${maxPerItem}
    RETURNING id`;
  if (!rows[0]) throw new Error(`見本メディアは1項目につき${maxPerItem}件までです`);
  return rows[0].id as string;
}

/** 見本メディアの削除。URL を返す（呼び出し側で Blob 削除）。 */
export async function deleteItemReferenceMedia(
  companyId: string,
  id: string
): Promise<string | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    DELETE FROM item_reference_media
    WHERE company_id = ${companyId} AND id = ${id}
    RETURNING url`;
  return (rows[0]?.url as string | undefined) ?? null;
}

/** 点検箇所写真の設定/解除。旧 URL を返す（呼び出し側で Blob 削除）。 */
export async function updateItemSpotPhoto(
  companyId: string,
  itemId: string,
  url: string | null
): Promise<string | null> {
  await ensureSchema();
  const sql = getSql();
  const old = await sql`
    SELECT spot_photo_url FROM inspection_items
    WHERE company_id = ${companyId} AND id = ${itemId} LIMIT 1`;
  await sql`
    UPDATE inspection_items SET spot_photo_url = ${url}, updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${itemId}`;
  return (old[0]?.spot_photo_url as string | undefined) ?? null;
}

/** 点検部位マップの図面設定/解除。旧 URL を返す（呼び出し側で Blob 削除）。 */
export async function setProcedureDiagram(
  companyId: string,
  procedureId: string,
  url: string | null
): Promise<string | null> {
  await ensureSchema();
  const sql = getSql();
  const old = await sql`
    SELECT diagram_url FROM inspection_procedures
    WHERE company_id = ${companyId} AND id = ${procedureId} LIMIT 1`;
  await sql`
    UPDATE inspection_procedures SET diagram_url = ${url}, updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${procedureId}`;
  return (old[0]?.diagram_url as string | undefined) ?? null;
}

/** 項目の点検部位マップ上のピン座標を設定/解除（0-100 に clamp）。 */
export async function updateItemMapPosition(
  companyId: string,
  itemId: string,
  pos: { x: number; y: number } | null
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const x = pos ? clamp(pos.x) : null;
  const y = pos ? clamp(pos.y) : null;
  await sql`
    UPDATE inspection_items SET map_x = ${x}, map_y = ${y}, updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${itemId}`;
}

/** 手順書の物理削除前に回収すべきメディアURL（箇所写真＋見本＋部位マップ図面）。 */
export async function collectProcedureMediaUrls(
  companyId: string,
  procedureId: string
): Promise<string[]> {
  await ensureSchema();
  const sql = getSql();
  const spot = await sql`
    SELECT spot_photo_url AS url FROM inspection_items
    WHERE company_id = ${companyId} AND procedure_id = ${procedureId} AND spot_photo_url IS NOT NULL`;
  const refs = await sql`
    SELECT m.url FROM item_reference_media m
    JOIN inspection_items i ON i.id = m.item_id
    WHERE m.company_id = ${companyId} AND i.procedure_id = ${procedureId}`;
  const diagram = await sql`
    SELECT diagram_url AS url FROM inspection_procedures
    WHERE company_id = ${companyId} AND id = ${procedureId} AND diagram_url IS NOT NULL`;
  return [...spot, ...refs, ...diagram].map((r: any) => r.url as string).filter(Boolean);
}

/** 項目の物理削除前に回収すべきメディアURL。 */
export async function collectItemMediaUrls(companyId: string, itemId: string): Promise<string[]> {
  await ensureSchema();
  const sql = getSql();
  const spot = await sql`
    SELECT spot_photo_url AS url FROM inspection_items
    WHERE company_id = ${companyId} AND id = ${itemId} AND spot_photo_url IS NOT NULL`;
  const refs = await sql`
    SELECT url FROM item_reference_media
    WHERE company_id = ${companyId} AND item_id = ${itemId}`;
  return [...spot, ...refs].map((r: any) => r.url as string).filter(Boolean);
}

// ===== 点検記録メディアの取得 =====

function mapResultMedia(r: any): ResultMedia {
  return {
    id: r.id,
    itemResultId: r.item_result_id,
    mediaType: (r.media_type ?? "photo") as MediaType,
    url: r.url,
    contentType: r.content_type ?? null,
    sizeBytes: r.size_bytes != null ? Number(r.size_bytes) : null,
    durationSeconds: numOrNull(r.duration_seconds),
    note: r.note ?? null,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

/** 記録1件分の項目別メディア（item_result_id → media[] の Map）。 */
export async function listResultMediaForRecord(
  companyId: string,
  recordId: string
): Promise<Map<string, ResultMedia[]>> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT rm.* FROM result_media rm
    JOIN inspection_item_results ir ON ir.id = rm.item_result_id
    WHERE rm.company_id = ${companyId} AND ir.record_id = ${recordId}
    ORDER BY rm.sort_order ASC, rm.created_at ASC`;
  const map = new Map<string, ResultMedia[]>();
  for (const r of rows) {
    const m = mapResultMedia(r);
    if (!map.has(m.itemResultId)) map.set(m.itemResultId, []);
    map.get(m.itemResultId)!.push(m);
  }
  return map;
}

/** 複数記録分の項目別メディアを一括取得（CSVエクスポート用）。 */
export async function listResultMediaForRecords(
  companyId: string,
  recordIds: string[]
): Promise<Map<string, ResultMedia[]>> {
  await ensureSchema();
  if (recordIds.length === 0) return new Map();
  const sql = getSql();
  const rows = await sql`
    SELECT rm.* FROM result_media rm
    JOIN inspection_item_results ir ON ir.id = rm.item_result_id
    WHERE rm.company_id = ${companyId} AND ir.record_id = ANY(${recordIds}::uuid[])
    ORDER BY rm.sort_order ASC, rm.created_at ASC`;
  const map = new Map<string, ResultMedia[]>();
  for (const r of rows) {
    const m = mapResultMedia(r);
    if (!map.has(m.itemResultId)) map.set(m.itemResultId, []);
    map.get(m.itemResultId)!.push(m);
  }
  return map;
}
