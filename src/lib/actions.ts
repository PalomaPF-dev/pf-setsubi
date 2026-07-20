"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getStorage, isStorageConfigured } from "./storage";
import { requireEntitledSession, requireAdminSession } from "./session";
import {
  createEquipment,
  updateEquipment,
  getEquipment,
  deleteEquipment,
  disposeEquipment,
  restoreEquipment,
  collectEquipmentBlobUrls,
  createDocument,
  getDocument,
  deleteDocument,
  createCustomFieldDef,
  updateCustomFieldDef,
  deleteCustomFieldDef,
  moveCustomFieldDef,
  listCustomFieldDefs,
  createProcedure,
  updateProcedure,
  deleteOrArchiveProcedure,
  createInspectionItem,
  updateInspectionItem,
  deleteOrArchiveInspectionItem,
  moveInspectionItem,
  listInspectionItems,
  assignProcedure,
  updateAssignment,
  unassignProcedure,
  getAssignment,
  createInspectionRecord,
  findRecordIdByClientKey,
  deleteInspectionRecord,
  approveRecord,
  returnRecord,
  resubmitRecord,
  listApproverEmails,
  designatedApproverEmailForUser,
  canActorApproveRecord,
  getRecordWithResults,
  getApprovalSettings,
  updateApprovalSettings,
  createCorrectiveAction,
  updateCorrectiveAction,
  resolveCorrectiveAction,
  reopenCorrectiveAction,
  deleteCorrectiveAction,
  getItemResultContext,
  createProcedureFromTemplate,
  updateManagementNoSettings,
  createSite,
  updateSite,
  moveSite,
  deleteSite,
  setSiteMapImage,
  createArea,
  updateArea,
  moveArea,
  deleteArea,
  updateEquipmentMapPosition,
  updateItemSpotPhoto,
  setProcedureDiagram,
  updateItemMapPosition,
  addItemReferenceMedia,
  deleteItemReferenceMedia,
  collectProcedureMediaUrls,
  collectItemMediaUrls,
  type EquipmentInput,
  type InspectionItemInput,
  type ItemResultInput,
  type ResultMediaInput,
} from "./db";
import { getProcedureTemplate } from "./procedureTemplates";
import { isOwnMediaUrl } from "./storage";
import { getMailer } from "./mailer";
import {
  MAX_REFERENCE_MEDIA_PER_ITEM,
  MAX_RESULT_MEDIA_PER_ITEM,
  AUDIO_MAX_SECONDS,
  VIDEO_MAX_SECONDS,
} from "./mediaLimits";
import { computeNextDueDate, judgeNumeric, todayJST } from "./inspection";
import type {
  EquipmentStatus,
  DocType,
  CustomFieldType,
  ItemType,
  PhotoMode,
  Judgment,
  MediaType,
} from "./types";

// ===== FormData ヘルパー =====
function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function strOrNull(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
}
function intOrNull(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (v === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}
function floatOrNull(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (v === "") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** DB から行を消した後にストレージ側も削除（失敗しても業務データは消えているので握り潰してログのみ）。 */
async function deleteBlobs(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  await getStorage().deleteFiles(urls);
}

/** フォームの cf_<defId> 入力からカスタム値マップを組み立てる（空値は保存しない）。 */
async function readCustomValues(companyId: string, fd: FormData): Promise<Record<string, string>> {
  const defs = await listCustomFieldDefs(companyId);
  const values: Record<string, string> = {};
  for (const def of defs) {
    const v = str(fd, `cf_${def.id}`);
    if (v !== "") values[def.id] = v;
  }
  return values;
}

function readEquipmentInput(fd: FormData): Omit<EquipmentInput, "customValues"> {
  return {
    managementNo: str(fd, "managementNo"),
    name: str(fd, "name"),
    category: strOrNull(fd, "category"),
    maker: strOrNull(fd, "maker"),
    modelNo: strOrNull(fd, "modelNo"),
    serialNo: strOrNull(fd, "serialNo"),
    location: strOrNull(fd, "location"),
    siteId: strOrNull(fd, "siteId"),
    areaId: strOrNull(fd, "areaId"),
    status: (strOrNull(fd, "status") ?? "active") as EquipmentStatus,
    installedDate: strOrNull(fd, "installedDate"),
    disposalDate: strOrNull(fd, "disposalDate"),
    notes: strOrNull(fd, "notes"),
  };
}

// ===== 設備（台帳） =====

export async function createEquipmentAction(fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const input = readEquipmentInput(fd);
  if (!input.managementNo || !input.name) {
    throw new Error("管理番号と設備名は必須です");
  }
  const customValues = await readCustomValues(companyId, fd);
  const id = await createEquipment(companyId, { ...input, customValues });
  revalidatePath("/equipment");
  revalidatePath("/");
  redirect(`/equipment/${id}`);
}

export async function updateEquipmentAction(id: string, fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const input = readEquipmentInput(fd);
  if (!input.managementNo || !input.name) {
    throw new Error("管理番号と設備名は必須です");
  }
  const customValues = await readCustomValues(companyId, fd);
  await updateEquipment(companyId, id, { ...input, customValues });
  revalidatePath("/equipment");
  revalidatePath(`/equipment/${id}`);
  revalidatePath("/");
  redirect(`/equipment/${id}`);
}

/** 設備を廃止（ソフト）。点検記録・添付を残したまま retired にする。 */
export async function disposeEquipmentAction(id: string): Promise<void> {
  const { companyId } = await requireAdminSession();
  await disposeEquipment(companyId, id);
  revalidatePath("/equipment");
  revalidatePath(`/equipment/${id}`);
  revalidatePath("/schedule");
  revalidatePath("/");
}

/** 廃止を取り消して稼働中に戻す。 */
export async function restoreEquipmentAction(id: string): Promise<void> {
  const { companyId } = await requireAdminSession();
  await restoreEquipment(companyId, id);
  revalidatePath("/equipment");
  revalidatePath(`/equipment/${id}`);
  revalidatePath("/schedule");
  revalidatePath("/");
}

/** 完全削除（設備・添付・割当・点検記録・Blob をすべて削除）。通常は廃止を推奨。 */
export async function deleteEquipmentAction(id: string): Promise<void> {
  const { companyId } = await requireAdminSession();
  const blobUrls = await collectEquipmentBlobUrls(companyId, id);
  await deleteEquipment(companyId, id);
  await deleteBlobs(blobUrls);
  revalidatePath("/equipment");
  revalidatePath("/inspections");
  revalidatePath("/schedule");
  revalidatePath("/");
  redirect("/equipment");
}

// ===== 添付（写真・PDF） =====

export async function uploadDocumentAction(fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const equipmentId = str(fd, "equipmentId");
  const docType = (strOrNull(fd, "docType") ?? "other") as DocType;
  const file = fd.get("file");

  if (!equipmentId) throw new Error("設備が指定されていません");
  // 他社の equipmentId を差し込んだアップロードを防ぐ（テナント所有チェック）
  const eq = await getEquipment(companyId, equipmentId);
  if (!eq) throw new Error("設備が見つかりません");
  if (!(file instanceof File) || file.size === 0) throw new Error("ファイルを選択してください");
  if (!isStorageConfigured()) {
    throw new Error("Blob ストレージ未設定です（BLOB_READ_WRITE_TOKEN）。Vercel Blob を接続してください。");
  }

  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const saved = await getStorage().saveFile({
    companyId,
    key: `equipment/${equipmentId}/${Date.now()}_${safeName}`,
    file,
    contentType: file.type || null,
  });

  const title = strOrNull(fd, "title") ?? file.name;
  await createDocument(companyId, {
    equipmentId,
    docType,
    title,
    blobUrl: saved.url,
    fileName: file.name,
    contentType: file.type || null,
    sizeBytes: file.size,
  });
  revalidatePath(`/equipment/${equipmentId}`);
}

export async function deleteDocumentAction(id: string, equipmentId: string): Promise<void> {
  const { companyId } = await requireAdminSession();
  const doc = await getDocument(companyId, id);
  await deleteDocument(companyId, id);
  if (doc?.blobUrl) await deleteBlobs([doc.blobUrl]);
  revalidatePath(`/equipment/${equipmentId}`);
}

// ===== カスタム項目定義 =====

function readCustomFieldDefInput(fd: FormData) {
  const fieldType = (strOrNull(fd, "fieldType") ?? "text") as CustomFieldType;
  const optionsRaw = str(fd, "options");
  const options =
    fieldType === "select"
      ? optionsRaw
          .split(/[,、\n]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : null;
  return { name: str(fd, "name"), fieldType, options };
}

export async function createCustomFieldDefAction(fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const input = readCustomFieldDefInput(fd);
  if (!input.name) throw new Error("項目名は必須です");
  if (input.fieldType === "select" && (!input.options || input.options.length === 0)) {
    throw new Error("選択肢タイプでは選択肢を1つ以上入力してください");
  }
  try {
    await createCustomFieldDef(companyId, input);
  } catch (e) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const code = (e as any)?.code ?? (e as any)?.sourceError?.code;
    if (code === "23505") throw new Error("同じ名前の項目が既にあります");
    throw e;
  }
  revalidatePath("/settings");
  revalidatePath("/equipment");
}

export async function updateCustomFieldDefAction(id: string, fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const input = readCustomFieldDefInput(fd);
  if (!input.name) throw new Error("項目名は必須です");
  await updateCustomFieldDef(companyId, id, input);
  revalidatePath("/settings");
  revalidatePath("/equipment");
}

export async function deleteCustomFieldDefAction(id: string): Promise<void> {
  const { companyId } = await requireAdminSession();
  await deleteCustomFieldDef(companyId, id);
  revalidatePath("/settings");
  revalidatePath("/equipment");
}

export async function moveCustomFieldDefAction(id: string, dir: "up" | "down"): Promise<void> {
  const { companyId } = await requireAdminSession();
  await moveCustomFieldDef(companyId, id, dir);
  revalidatePath("/settings");
}

// ===== 点検手順書 =====

export async function createProcedureAction(fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const name = str(fd, "name");
  if (!name) throw new Error("手順書名は必須です");
  const id = await createProcedure(companyId, {
    name,
    description: strOrNull(fd, "description"),
  });
  revalidatePath("/checklists");
  redirect(`/checklists/${id}`);
}

export async function updateProcedureAction(id: string, fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const name = str(fd, "name");
  if (!name) throw new Error("手順書名は必須です");
  await updateProcedure(companyId, id, {
    name,
    description: strOrNull(fd, "description"),
  });
  revalidatePath("/checklists");
  revalidatePath(`/checklists/${id}`);
}

/** 手順書の削除（記録があればアーカイブ）。割当はどちらの場合も解除される。物理削除時はメディアも回収。 */
export async function deleteProcedureAction(id: string): Promise<void> {
  const { companyId } = await requireAdminSession();
  const mediaUrls = await collectProcedureMediaUrls(companyId, id);
  const outcome = await deleteOrArchiveProcedure(companyId, id);
  if (outcome === "deleted") await deleteBlobs(mediaUrls);
  revalidatePath("/checklists");
  revalidatePath("/equipment");
  revalidatePath("/schedule");
  revalidatePath("/");
  redirect("/checklists");
}

// ===== 点検項目 =====

function readItemInput(fd: FormData, procedureId: string): InspectionItemInput {
  return {
    procedureId,
    label: str(fd, "label"),
    itemType: (strOrNull(fd, "itemType") ?? "ok_ng") as ItemType,
    instruction: strOrNull(fd, "instruction"),
    unit: strOrNull(fd, "unit"),
    minValue: floatOrNull(fd, "minValue"),
    maxValue: floatOrNull(fd, "maxValue"),
    photoMode: (strOrNull(fd, "photoMode") ?? "none") as PhotoMode,
    requireCommentOnNg: fd.get("requireCommentOnNg") != null,
  };
}

export async function addInspectionItemAction(fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const procedureId = str(fd, "procedureId");
  if (!procedureId) throw new Error("手順書が指定されていません");
  const input = readItemInput(fd, procedureId);
  if (!input.label) throw new Error("項目名は必須です");
  await createInspectionItem(companyId, input);
  revalidatePath(`/checklists/${procedureId}`);
}

export async function updateInspectionItemAction(id: string, fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const procedureId = str(fd, "procedureId");
  const input = readItemInput(fd, procedureId);
  if (!input.label) throw new Error("項目名は必須です");
  await updateInspectionItem(companyId, id, input);
  revalidatePath(`/checklists/${procedureId}`);
}

export async function deleteInspectionItemAction(id: string, procedureId: string): Promise<void> {
  const { companyId } = await requireAdminSession();
  const mediaUrls = await collectItemMediaUrls(companyId, id);
  const outcome = await deleteOrArchiveInspectionItem(companyId, id, procedureId);
  if (outcome === "deleted") await deleteBlobs(mediaUrls);
  revalidatePath(`/checklists/${procedureId}`);
}

export async function moveInspectionItemAction(
  id: string,
  procedureId: string,
  dir: "up" | "down"
): Promise<void> {
  const { companyId } = await requireAdminSession();
  await moveInspectionItem(companyId, id, procedureId, dir);
  revalidatePath(`/checklists/${procedureId}`);
}

// ===== 割当（点検スケジュール） =====

export async function assignProcedureAction(fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const equipmentId = str(fd, "equipmentId");
  const procedureId = str(fd, "procedureId");
  if (!equipmentId || !procedureId) throw new Error("手順書を選択してください");
  const intervalUnit = strOrNull(fd, "intervalUnit") ?? "months";
  const intervalValue = intOrNull(fd, "intervalValue");
  await assignProcedure(companyId, {
    equipmentId,
    procedureId,
    intervalMonths: intervalUnit === "months" ? intervalValue : null,
    intervalDays: intervalUnit === "days" ? intervalValue : null,
    lastInspectedDate: strOrNull(fd, "lastInspectedDate"),
    nextDueDate: strOrNull(fd, "nextDueDate"),
  });
  revalidatePath(`/equipment/${equipmentId}`);
  revalidatePath("/schedule");
  revalidatePath("/");
}

export async function updateAssignmentAction(id: string, fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const equipmentId = str(fd, "equipmentId");
  const intervalUnit = strOrNull(fd, "intervalUnit") ?? "months";
  const intervalValue = intOrNull(fd, "intervalValue");
  await updateAssignment(companyId, id, {
    intervalMonths: intervalUnit === "months" ? intervalValue : null,
    intervalDays: intervalUnit === "days" ? intervalValue : null,
    lastInspectedDate: strOrNull(fd, "lastInspectedDate"),
    nextDueDate: strOrNull(fd, "nextDueDate"),
  });
  if (equipmentId) revalidatePath(`/equipment/${equipmentId}`);
  revalidatePath("/schedule");
  revalidatePath("/");
}

export async function unassignProcedureAction(id: string, equipmentId: string): Promise<void> {
  const { companyId } = await requireAdminSession();
  await unassignProcedure(companyId, id);
  revalidatePath(`/equipment/${equipmentId}`);
  revalidatePath("/schedule");
  revalidatePath("/");
}

// ===== 点検実施 =====

export interface WizardMediaInput {
  type: MediaType;
  url: string;
  durationSeconds?: number | null;
  note?: string | null;
}

export interface WizardAnswer {
  itemId: string;
  judgment?: Judgment | null;
  valueNumeric?: number | null;
  valueText?: string | null;
  photoUrl?: string | null;
  /** 追加の記録メディア（写真・音声・動画。任意複数） */
  media?: WizardMediaInput[];
}

export interface CompleteInspectionPayload {
  assignmentId: string;
  inspectionDate: string; // YYYY-MM-DD
  notes: string | null;
  /** 点検開始時に選択/入力した作業者名。未指定ならログインユーザー名を使う */
  inspectorName?: string | null;
  /** ウィザード開始時に画面に出した項目定義（並行編集の突合用） */
  itemsSignature: Array<{ id: string; updatedAt: string }>;
  answers: WizardAnswer[];
  /** 冪等キー（ウィザードの draftKey）。応答喪失後の再送を同一記録として扱う */
  clientKey?: string;
}

/** 承認依頼メールの from（既存の XXX_MAIL_FROM 慣習に合わせる）。 */
function approvalMailFrom(): string {
  return (
    process.env.APPROVAL_MAIL_FROM ||
    process.env.ALERT_MAIL_FROM ||
    process.env.MAIL_FROM ||
    "PF設備管理 <onboarding@resend.dev>"
  );
}

function appOrigin(): string {
  return (process.env.APP_URL || "https://setsubi.paloma-pf.com").replace(/\/+$/, "");
}

/**
 * 点検完了→管理者への承認依頼メール（結果つき）。送信失敗は握り潰す（保存/遷移を止めない）。
 * デモ会社・メール未設定・宛先なしは静かにスキップ。
 */
async function notifyApprovalRequested(opts: {
  companyId: string;
  companyName: string;
  isDemo: boolean;
  recordId: string;
  equipmentName: string;
  managementNo: string;
  procedureName: string;
  inspector: string;
  inspectionDate: string;
  result: "pass" | "fail";
  ngCount: number;
  inspectorEmail?: string;
  /** 提出者のユーザーID（指名承認者へのメールルーティング用） */
  inspectorUserId?: string | null;
}): Promise<void> {
  if (opts.isDemo) return;
  const mailer = getMailer();
  if (!mailer) return;
  try {
    // 提出者に指名承認者（approver_login_id）がいてメールを持っていればその人だけに送り、
    // いなければ従来どおり（会社設定の承認者メール → 全ユーザー）にフォールバック。
    let to: string[] = [];
    if (opts.inspectorUserId) {
      const designated = await designatedApproverEmailForUser(opts.inspectorUserId);
      if (designated) to = [designated];
    }
    if (to.length === 0) to = await listApproverEmails(opts.companyId);
    if (to.length === 0) return;
    const resultLabel = opts.result === "fail" ? `不合格（NG ${opts.ngCount}件）` : "合格";
    const eq = opts.managementNo ? `${opts.equipmentName}（${opts.managementNo}）` : opts.equipmentName;
    const link = `${appOrigin()}/inspections/${opts.recordId}`;
    const text = [
      `${opts.companyName} の点検が完了し、承認待ちです。`,
      "",
      `設備　　: ${eq}`,
      `手順書　: ${opts.procedureName}`,
      `点検日　: ${opts.inspectionDate}`,
      `作業者　: ${opts.inspector}`,
      `点検結果: ${resultLabel}`,
      "",
      `下記のページから内容を確認し、承認または差し戻しを行ってください。`,
      link,
      "",
      "— PF設備管理",
    ].join("\n");
    await mailer.send({
      from: approvalMailFrom(),
      to,
      subject: `【PF設備管理】点検完了 承認依頼（${eq}）`,
      text,
      ...(opts.inspectorEmail ? { replyTo: opts.inspectorEmail } : {}),
    });
  } catch (e) {
    console.warn("[inspection] approval mail failed:", (e as Error).message);
  }
}

/**
 * 点検完了。入力値はクライアントを信用せず、判定・スナップショットは
 * サーバーが DB の現行定義から再計算する。開始時と定義が変わっていたらリジェクト。
 * 想定内の検証エラーは throw せず { error } で返す
 * （本番ビルドでは throw したメッセージが Next.js にマスクされ、クライアントに届かないため）。
 * 成功時は redirect が throw するので戻らない。
 */
export async function completeInspectionAction(
  payload: CompleteInspectionPayload
): Promise<{ error: string }> {
  const { companyId, companyName, userId, userName, email, isDemo } =
    await requireEntitledSession();

  // 冪等キー: 前回の送信が「サーバーでは成功・応答だけ喪失」だった場合、
  // 再送は既存記録へのリダイレクトで成功扱いにする（二重登録防止）。
  const clientKey =
    typeof payload.clientKey === "string" && /^[\w-]{8,64}$/.test(payload.clientKey)
      ? payload.clientKey
      : null;
  if (clientKey) {
    const existing = await findRecordIdByClientKey(companyId, clientKey);
    if (existing) redirect(`/inspections/${existing}`);
  }

  const assignment = await getAssignment(companyId, payload.assignmentId);
  if (!assignment) return { error: "点検の割当が見つかりません" };

  const inspectionDate = /^\d{4}-\d{2}-\d{2}$/.test(payload.inspectionDate)
    ? payload.inspectionDate
    : todayJST();

  const items = await listInspectionItems(companyId, assignment.procedureId);
  if (items.length === 0) return { error: "この手順書には点検項目がありません" };

  // 並行編集の突合: ウィザードが表示した定義と現行定義が一致しなければやり直し
  const sig = new Map(payload.itemsSignature.map((s) => [s.id, s.updatedAt]));
  const mismatch =
    items.length !== payload.itemsSignature.length ||
    items.some((it) => sig.get(it.id) !== it.updatedAt);
  if (mismatch) {
    return {
      error:
        "手順書が変更されました。一覧に戻って点検を開き直してください（入力途中の内容は下書きに残っています）。",
    };
  }

  const answerMap = new Map(payload.answers.map((a) => [a.itemId, a]));
  const results: ItemResultInput[] = [];
  let ngCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const a = answerMap.get(item.id);
    if (!a) return { error: `「${item.label}」が未入力です` };

    let judgment: Judgment | null = null;
    let autoJudgment: Judgment | null = null;
    let valueNumeric: number | null = null;
    const valueText = (a.valueText ?? "").trim() || null;
    const photoUrl = a.photoUrl ?? null;
    if (photoUrl && !isOwnMediaUrl(photoUrl, companyId)) {
      return {
        error: `「${item.label}」の写真を読み込めませんでした。お手数ですが、この項目に戻って写真をもう一度撮り直してから送付してください`,
      };
    }

    // 追加メディアの検証（件数・種別・URL・申告時間）
    const rawMedia = Array.isArray(a.media) ? a.media : [];
    if (rawMedia.length > MAX_RESULT_MEDIA_PER_ITEM) {
      return { error: `「${item.label}」のメディアは${MAX_RESULT_MEDIA_PER_ITEM}件までです` };
    }
    const media: ResultMediaInput[] = [];
    for (const m of rawMedia) {
      if (m.type !== "photo" && m.type !== "audio" && m.type !== "video") {
        return { error: `「${item.label}」のメディア種別が不正です` };
      }
      if (typeof m.url !== "string" || !isOwnMediaUrl(m.url, companyId)) {
        return {
          error: `「${item.label}」の音声・動画を読み込めませんでした。お手数ですが、この項目に戻って一度削除し、もう一度録り直してから送付してください`,
        };
      }
      const maxSec = m.type === "video" ? VIDEO_MAX_SECONDS : AUDIO_MAX_SECONDS;
      const dur =
        typeof m.durationSeconds === "number" &&
        Number.isFinite(m.durationSeconds) &&
        m.durationSeconds > 0
          ? Math.min(m.durationSeconds, maxSec + 5) // 申告値。多少の誤差は許容
          : null;
      media.push({
        mediaType: m.type,
        url: m.url,
        durationSeconds: dur,
        note: (m.note ?? "").trim() || null,
      });
    }

    if (item.itemType === "ok_ng") {
      if (a.judgment !== "ok" && a.judgment !== "ng") {
        return { error: `「${item.label}」の OK/NG を選択してください` };
      }
      judgment = a.judgment;
    } else if (item.itemType === "numeric") {
      if (a.valueNumeric == null || !Number.isFinite(a.valueNumeric)) {
        return { error: `「${item.label}」の数値を入力してください` };
      }
      valueNumeric = a.valueNumeric;
      autoJudgment = judgeNumeric(valueNumeric, item.minValue, item.maxValue);
      judgment = a.judgment === "ok" || a.judgment === "ng" ? a.judgment : autoJudgment;
      if (judgment !== autoJudgment && !valueText) {
        return { error: `「${item.label}」は基準値と異なる判定です。理由をコメントに入力してください` };
      }
    } else if (item.itemType === "photo") {
      if (!photoUrl) return { error: `「${item.label}」の写真を撮影してください` };
    }
    // text はコメント欄のみ（判定なし）

    if (item.photoMode === "required" && !photoUrl) {
      return { error: `「${item.label}」は写真が必須です` };
    }
    if (item.requireCommentOnNg && judgment === "ng" && !valueText) {
      return { error: `「${item.label}」が NG の場合はコメントが必須です` };
    }
    if (judgment === "ng") ngCount++;

    results.push({
      itemId: item.id,
      sortOrder: i,
      itemLabel: item.label,
      itemType: item.itemType,
      judgment,
      autoJudgment,
      valueNumeric,
      unit: item.unit,
      minValue: item.minValue,
      maxValue: item.maxValue,
      valueText,
      photoUrl,
      media,
    });
  }

  const nextDueDate = computeNextDueDate(
    inspectionDate,
    assignment.intervalMonths,
    assignment.intervalDays
  );

  // 作業者名: 開始時に選択/入力した名前を優先。監査用に inspectorUserId は常にログインユーザー。
  const inspector = (payload.inspectorName ?? "").trim() || userName || "（不明）";

  let recordId: string;
  try {
    recordId = await createInspectionRecord(companyId, {
      equipmentId: assignment.equipmentId,
      procedureId: assignment.procedureId,
      procedureName: assignment.procedureName ?? "",
      inspectionDate,
      inspector,
      inspectorUserId: userId,
      result: ngCount > 0 ? "fail" : "pass",
      ngCount,
      notes: payload.notes,
      results,
      assignmentId: payload.assignmentId,
      nextDueDate,
      clientKey,
    });
  } catch (e) {
    // 同時二重送信のレース: ユニーク違反なら既存記録を成功扱いで返す
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const code = (e as any)?.code ?? (e as any)?.sourceError?.code;
    if (code === "23505" && clientKey) {
      const existing = await findRecordIdByClientKey(companyId, clientKey);
      if (existing) redirect(`/inspections/${existing}`);
    }
    throw e;
  }

  // 管理者へ承認依頼メール（結果つき）。redirect の前・try/catch 内で完結させ、
  // 送信失敗やメール未設定が保存/遷移を妨げないようにする。
  await notifyApprovalRequested({
    companyId,
    companyName,
    isDemo,
    recordId,
    equipmentName: assignment.equipmentName ?? "",
    managementNo: assignment.managementNo ?? "",
    procedureName: assignment.procedureName ?? "",
    inspector,
    inspectionDate,
    result: ngCount > 0 ? "fail" : "pass",
    ngCount,
    inspectorEmail: email,
    inspectorUserId: userId,
  });

  revalidatePath("/");
  revalidatePath("/inspections");
  revalidatePath("/schedule");
  revalidatePath(`/equipment/${assignment.equipmentId}`);
  redirect(`/inspections/${recordId}`);
}

/** 点検記録の削除（項目結果は CASCADE、写真 Blob も削除）。 */
export async function deleteInspectionRecordAction(
  id: string,
  equipmentId: string
): Promise<void> {
  const { companyId } = await requireEntitledSession();
  const photoUrls = await deleteInspectionRecord(companyId, id);
  await deleteBlobs(photoUrls);
  revalidatePath("/inspections");
  revalidatePath(`/equipment/${equipmentId}`);
  revalidatePath("/");
  redirect("/inspections");
}

// ===== 点検承認ワークフロー（承認 / 差し戻し / 再提出） =====

/** 承認後の再検証（詳細・一覧・ダッシュボード・スケジュール・設備）。 */
function revalidateAfterApproval(recordId: string, equipmentId: string | null) {
  revalidatePath(`/inspections/${recordId}`);
  revalidatePath("/inspections");
  revalidatePath("/");
  revalidatePath("/schedule");
  if (equipmentId) revalidatePath(`/equipment/${equipmentId}`);
}

/** 承認する（承認済み＝点検完了として確定）。 */
export async function approveInspectionAction(recordId: string): Promise<{ error?: string }> {
  const { companyId, userId, userName } = await requireEntitledSession();
  const rec = await getRecordWithResults(companyId, recordId);
  if (!rec) return { error: "点検記録が見つかりません" };
  // 承認ルーティング: 管理者は「提出者の指名承認者が未設定 or 自分」の記録のみ承認可能
  if (!(await canActorApproveRecord(companyId, recordId, userId))) {
    return { error: "この点検の承認は、提出者が指名した承認者のみ行えます" };
  }
  await approveRecord(companyId, recordId, userId, userName || "（承認者）");
  revalidateAfterApproval(recordId, rec.record.equipmentId);
  return {};
}

/** 差し戻す（理由必須。当該設備を再点検対象に戻す）。 */
export async function returnInspectionAction(
  recordId: string,
  fd: FormData
): Promise<{ error?: string }> {
  const { companyId, userId, userName } = await requireEntitledSession();
  const comment = str(fd, "comment");
  if (!comment) return { error: "差し戻しの理由を入力してください" };
  const rec = await getRecordWithResults(companyId, recordId);
  if (!rec) return { error: "点検記録が見つかりません" };
  // 承認ルーティング: 管理者は「提出者の指名承認者が未設定 or 自分」の記録のみ差し戻し可能
  if (!(await canActorApproveRecord(companyId, recordId, userId))) {
    return { error: "この点検の差し戻しは、提出者が指名した承認者のみ行えます" };
  }
  await returnRecord(companyId, recordId, userId, userName || "（承認者）", comment);
  revalidateAfterApproval(recordId, rec.record.equipmentId);
  return {};
}

/** 差し戻された点検を再提出する（再度承認待ちに戻す）。 */
export async function resubmitInspectionAction(recordId: string): Promise<{ error?: string }> {
  const { companyId } = await requireEntitledSession();
  const rec = await getRecordWithResults(companyId, recordId);
  if (!rec) return { error: "点検記録が見つかりません" };
  await resubmitRecord(companyId, recordId);
  revalidateAfterApproval(recordId, rec.record.equipmentId);
  return {};
}

// ===== 採番ルール設定 =====

export async function updateManagementNoSettingsAction(fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const prefix = str(fd, "prefix") || "S";
  const digits = Math.max(1, Math.min(8, parseInt(str(fd, "digits") || "4", 10)));
  const seq = Math.max(1, parseInt(str(fd, "seq") || "1", 10));
  await updateManagementNoSettings(companyId, { prefix, digits, seq });
  revalidatePath("/settings");
}

// ===== 承認ワークフロー設定（承認者メール） =====

export async function updateApprovalSettingsAction(fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const approverEmail = strOrNull(fd, "approverEmail");
  await updateApprovalSettings(companyId, { approverEmail });
  revalidatePath("/settings");
}

// ===== 処置（NG項目への是正対応） =====

/** 処置の起票。itemResultId がある場合は DB から記録・設備・項目名を導出（クライアント値は信用しない）。 */
export async function createCorrectiveActionAction(fd: FormData): Promise<void> {
  const { companyId } = await requireEntitledSession();
  const title = str(fd, "title");
  if (!title) throw new Error("処置のタイトルは必須です");

  const itemResultId = strOrNull(fd, "itemResultId");
  let equipmentId: string;
  let recordId: string | null = null;
  let itemLabel: string | null = null;

  if (itemResultId) {
    const ctx = await getItemResultContext(companyId, itemResultId);
    if (!ctx) throw new Error("起票元の点検項目が見つかりません");
    equipmentId = ctx.equipmentId;
    recordId = ctx.recordId;
    itemLabel = ctx.itemLabel;
  } else {
    equipmentId = str(fd, "equipmentId");
    if (!equipmentId) throw new Error("設備を選択してください");
  }

  await createCorrectiveAction(companyId, {
    equipmentId,
    recordId,
    itemResultId,
    itemLabel,
    title,
    detail: strOrNull(fd, "detail"),
    assignee: strOrNull(fd, "assignee"),
    dueDate: strOrNull(fd, "dueDate"),
  });
  revalidatePath("/actions");
  revalidatePath("/");
  revalidatePath(`/equipment/${equipmentId}`);
  if (recordId) revalidatePath(`/inspections/${recordId}`);
  redirect("/actions");
}

export async function updateCorrectiveActionAction(id: string, fd: FormData): Promise<void> {
  const { companyId } = await requireEntitledSession();
  const title = str(fd, "title");
  if (!title) throw new Error("処置のタイトルは必須です");
  const statusRaw = strOrNull(fd, "status");
  const status = statusRaw === "in_progress" ? "in_progress" : "open";
  await updateCorrectiveAction(companyId, id, {
    title,
    detail: strOrNull(fd, "detail"),
    assignee: strOrNull(fd, "assignee"),
    dueDate: strOrNull(fd, "dueDate"),
    status,
  });
  const equipmentId = strOrNull(fd, "equipmentId");
  revalidatePath("/actions");
  revalidatePath("/");
  if (equipmentId) revalidatePath(`/equipment/${equipmentId}`);
}

export async function completeCorrectiveActionAction(id: string, fd: FormData): Promise<void> {
  const { companyId } = await requireEntitledSession();
  await resolveCorrectiveAction(companyId, id, strOrNull(fd, "resolvedNote"));
  const equipmentId = strOrNull(fd, "equipmentId");
  revalidatePath("/actions");
  revalidatePath("/");
  if (equipmentId) revalidatePath(`/equipment/${equipmentId}`);
}

export async function reopenCorrectiveActionAction(id: string, equipmentId: string): Promise<void> {
  const { companyId } = await requireEntitledSession();
  await reopenCorrectiveAction(companyId, id);
  revalidatePath("/actions");
  revalidatePath("/");
  if (equipmentId) revalidatePath(`/equipment/${equipmentId}`);
}

export async function deleteCorrectiveActionAction(id: string, equipmentId: string): Promise<void> {
  const { companyId } = await requireEntitledSession();
  await deleteCorrectiveAction(companyId, id);
  revalidatePath("/actions");
  revalidatePath("/");
  if (equipmentId) revalidatePath(`/equipment/${equipmentId}`);
}

// ===== 手順書テンプレート =====

/** テンプレートから手順書+項目を一括作成（key はサーバー側で解決するため改ざん不能）。 */
export async function createProcedureFromTemplateAction(key: string): Promise<void> {
  const { companyId } = await requireAdminSession();
  const tpl = getProcedureTemplate(key);
  if (!tpl) throw new Error("テンプレートが見つかりません");
  const id = await createProcedureFromTemplate(companyId, tpl);
  revalidatePath("/checklists");
  redirect(`/checklists/${id}`);
}

// ===== 工場・職場マスタ =====

export async function createSiteAction(fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const name = str(fd, "name");
  if (!name) throw new Error("工場名は必須です");
  await createSite(companyId, { name });
  revalidatePath("/settings");
  revalidatePath("/equipment");
  revalidatePath("/");
}

export async function updateSiteAction(id: string, fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const name = str(fd, "name");
  if (!name) throw new Error("工場名は必須です");
  await updateSite(companyId, id, { name });
  revalidatePath("/settings");
  revalidatePath("/equipment");
  revalidatePath("/");
}

export async function moveSiteAction(id: string, dir: "up" | "down"): Promise<void> {
  const { companyId } = await requireAdminSession();
  await moveSite(companyId, id, dir);
  revalidatePath("/settings");
}

export async function deleteSiteAction(id: string): Promise<void> {
  const { companyId } = await requireAdminSession();
  const mapUrl = await deleteSite(companyId, id);
  if (mapUrl) await deleteBlobs([mapUrl]);
  revalidatePath("/settings");
  revalidatePath("/equipment");
  revalidatePath("/");
}

/** マップ画像の設定（アップロード済み URL を保存）/ null で解除。旧画像は Blob からも削除。 */
export async function setSiteMapImageAction(id: string, url: string | null): Promise<void> {
  const { companyId } = await requireAdminSession();
  if (url !== null && !isOwnMediaUrl(url, companyId)) {
    throw new Error("画像URLが不正です");
  }
  const old = await setSiteMapImage(companyId, id, url);
  if (old && old !== url) await deleteBlobs([old]);
  revalidatePath("/settings");
  revalidatePath("/equipment");
}

export async function createAreaAction(fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const siteId = str(fd, "siteId");
  const name = str(fd, "name");
  if (!siteId || !name) throw new Error("職場名は必須です");
  await createArea(companyId, { siteId, name });
  revalidatePath("/settings");
  revalidatePath("/equipment");
}

export async function updateAreaAction(id: string, fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const name = str(fd, "name");
  if (!name) throw new Error("職場名は必須です");
  await updateArea(companyId, id, { name });
  revalidatePath("/settings");
  revalidatePath("/equipment");
}

export async function moveAreaAction(id: string, siteId: string, dir: "up" | "down"): Promise<void> {
  const { companyId } = await requireAdminSession();
  await moveArea(companyId, id, siteId, dir);
  revalidatePath("/settings");
}

export async function deleteAreaAction(id: string): Promise<void> {
  const { companyId } = await requireAdminSession();
  await deleteArea(companyId, id);
  revalidatePath("/settings");
  revalidatePath("/equipment");
}

// ===== 設備のマップ配置 =====

export async function setEquipmentMapPositionAction(
  equipmentId: string,
  fd: FormData
): Promise<void> {
  const { companyId } = await requireAdminSession();
  const x = floatOrNull(fd, "x");
  const y = floatOrNull(fd, "y");
  if (x == null || y == null) throw new Error("マップ上の位置を指定してください");
  await updateEquipmentMapPosition(companyId, equipmentId, { x, y });
  revalidatePath(`/equipment/${equipmentId}`);
  revalidatePath("/equipment");
}

export async function clearEquipmentMapPositionAction(equipmentId: string): Promise<void> {
  const { companyId } = await requireAdminSession();
  await updateEquipmentMapPosition(companyId, equipmentId, null);
  revalidatePath(`/equipment/${equipmentId}`);
  revalidatePath("/equipment");
}

// ===== 点検箇所写真・正常見本メディア =====

/** 点検箇所写真の設定（アップロード済み URL を保存）/ null で解除。旧写真は Blob からも削除。 */
export async function setItemSpotPhotoAction(
  itemId: string,
  procedureId: string,
  url: string | null
): Promise<void> {
  const { companyId } = await requireAdminSession();
  if (url !== null && !isOwnMediaUrl(url, companyId)) {
    throw new Error("画像URLが不正です");
  }
  const old = await updateItemSpotPhoto(companyId, itemId, url);
  if (old && old !== url) await deleteBlobs([old]);
  revalidatePath(`/checklists/${procedureId}`);
}

// ===== 点検部位マップ（手順書の図面＋項目のピン） =====

/** 手順書の図面（点検部位マップ）を設定/解除。旧画像は Blob からも削除。 */
export async function setProcedureDiagramAction(
  procedureId: string,
  url: string | null
): Promise<void> {
  const { companyId } = await requireAdminSession();
  if (url !== null && !isOwnMediaUrl(url, companyId)) {
    throw new Error("画像URLが不正です");
  }
  const old = await setProcedureDiagram(companyId, procedureId, url);
  if (old && old !== url) await deleteBlobs([old]);
  revalidatePath(`/checklists/${procedureId}`);
}

/** 項目の点検部位マップ上の位置を設定。 */
export async function setItemMapPositionAction(
  itemId: string,
  procedureId: string,
  x: number,
  y: number
): Promise<void> {
  const { companyId } = await requireAdminSession();
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("位置が不正です");
  await updateItemMapPosition(companyId, itemId, { x, y });
  revalidatePath(`/checklists/${procedureId}`);
}

/** 項目のピンを解除。 */
export async function clearItemMapPositionAction(
  itemId: string,
  procedureId: string
): Promise<void> {
  const { companyId } = await requireAdminSession();
  await updateItemMapPosition(companyId, itemId, null);
  revalidatePath(`/checklists/${procedureId}`);
}

export interface AddReferenceMediaPayload {
  itemId: string;
  procedureId: string;
  mediaType: MediaType;
  url: string;
  contentType?: string | null;
  sizeBytes?: number | null;
  durationSeconds?: number | null;
  caption?: string | null;
}

export async function addItemReferenceMediaAction(
  payload: AddReferenceMediaPayload
): Promise<{ error?: string }> {
  const { companyId } = await requireAdminSession();
  if (payload.mediaType !== "photo" && payload.mediaType !== "audio" && payload.mediaType !== "video") {
    return { error: "メディア種別が不正です" };
  }
  if (!isOwnMediaUrl(payload.url, companyId)) {
    return { error: "メディアURLが不正です" };
  }
  try {
    await addItemReferenceMedia(
      companyId,
      {
        itemId: payload.itemId,
        mediaType: payload.mediaType,
        url: payload.url,
        contentType: payload.contentType ?? null,
        sizeBytes: payload.sizeBytes ?? null,
        durationSeconds: payload.durationSeconds ?? null,
        caption: (payload.caption ?? "").trim() || null,
      },
      MAX_REFERENCE_MEDIA_PER_ITEM
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "登録に失敗しました" };
  }
  revalidatePath(`/checklists/${payload.procedureId}`);
  return {};
}

export async function deleteItemReferenceMediaAction(
  id: string,
  procedureId: string
): Promise<void> {
  const { companyId } = await requireAdminSession();
  const url = await deleteItemReferenceMedia(companyId, id);
  if (url) await deleteBlobs([url]);
  revalidatePath(`/checklists/${procedureId}`);
}
