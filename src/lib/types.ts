// ===== PF設備管理 ドメイン型 =====

/** 設備ステータス */
export type EquipmentStatus = "active" | "stopped" | "repair" | "retired";

export const EQUIPMENT_STATUS_LABEL: Record<EquipmentStatus, string> = {
  active: "稼働中",
  stopped: "休止中",
  repair: "修理中",
  retired: "廃止",
};

/** 書類種別 */
export type DocType = "photo" | "manual" | "drawing" | "other";

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  photo: "設備写真",
  manual: "取扱説明書",
  drawing: "図面",
  other: "その他",
};

/** カスタム項目タイプ */
export type CustomFieldType = "text" | "number" | "date" | "select";

export const CUSTOM_FIELD_TYPE_LABEL: Record<CustomFieldType, string> = {
  text: "テキスト",
  number: "数値",
  date: "日付",
  select: "選択肢",
};

/** 点検項目タイプ */
export type ItemType = "ok_ng" | "numeric" | "text" | "photo";

export const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  ok_ng: "OK/NG判定",
  numeric: "数値入力",
  text: "テキスト",
  photo: "写真",
};

/** 写真添付モード（点検項目ごと） */
export type PhotoMode = "none" | "optional" | "required";

export const PHOTO_MODE_LABEL: Record<PhotoMode, string> = {
  none: "不要",
  optional: "任意",
  required: "必須",
};

/**
 * 項目判定。
 * - na: 該当なし（号機ごとに仕様が異なり、その設備には存在しない項目。NG には数えない）
 */
export type Judgment = "ok" | "ng" | "na";

export const JUDGMENT_LABEL: Record<Judgment, string> = {
  ok: "OK",
  ng: "NG",
  na: "該当なし",
};

/** 点検記録の総合結果 */
export type RecordResult = "pass" | "fail";

export const RECORD_RESULT_LABEL: Record<RecordResult, string> = {
  pass: "OK",
  fail: "NG",
};

/**
 * 点検記録の承認ステート（result とは直交）。
 * - pending  : 承認待ち（作業者が実施、管理者の承認待ち）
 * - approved : 承認済み（管理者が承認＝点検完了として確定）
 * - returned : 差し戻し（管理者が再点検を指示。review_comment に理由）
 */
export type ApprovalStatus = "pending" | "approved" | "returned";

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending: "承認待ち",
  approved: "承認済み",
  returned: "差し戻し",
};

/** 設備（台帳の1件） */
export interface Equipment {
  id: string;
  companyId: string;
  managementNo: string;
  name: string;
  category: string | null;
  maker: string | null;
  modelNo: string | null;
  serialNo: string | null;
  location: string | null; // 詳細位置（自由記入）
  siteId: string | null; // 工場
  areaId: string | null; // 職場
  mapX: number | null; // マップ上のピン座標（画像に対する % 0-100、未配置は null）
  mapY: number | null;
  status: EquipmentStatus;
  installedDate: string | null; // 導入日 YYYY-MM-DD
  disposalDate: string | null; // 廃止日 YYYY-MM-DD
  notes: string | null;
  customValues: Record<string, string>; // key = CustomFieldDef.id
  createdAt: string;
  updatedAt: string;
  siteName?: string; // JOIN 付加
  areaName?: string;
}

/** カスタム項目定義（会社単位・ノーコード） */
export interface CustomFieldDef {
  id: string;
  name: string;
  fieldType: CustomFieldType;
  options: string[] | null; // select の選択肢
  sortOrder: number;
}

/** 添付書類 */
export interface DocumentRow {
  id: string;
  equipmentId: string;
  docType: DocType;
  title: string;
  blobUrl: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  uploadedAt: string;
}

/** 点検手順書（テンプレート） */
export interface InspectionProcedure {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
  /** 点検部位マップの写真/図面（各項目をこの上にピン配置） */
  diagramUrl: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount?: number;
  assignedCount?: number;
  recordCount?: number;
}

/** 手順書の点検項目 */
export interface InspectionItem {
  id: string;
  procedureId: string;
  sortOrder: number;
  label: string;
  itemType: ItemType;
  instruction: string | null; // 点検方法の補足
  unit: string | null; // numeric 用
  minValue: number | null; // numeric 用（以上で OK）
  maxValue: number | null; // numeric 用（以下で OK）
  photoMode: PhotoMode;
  requireCommentOnNg: boolean;
  spotPhotoUrl: string | null; // 点検箇所の写真（どの部位を見るか）
  mapX: number | null; // 点検部位マップ上のピン座標（% 0-100、未配置は null）
  mapY: number | null;
  archived: boolean;
  updatedAt: string;
}

/** 設備への手順書割当（点検スケジュール） */
export interface EquipmentProcedure {
  id: string;
  equipmentId: string;
  procedureId: string;
  intervalMonths: number | null;
  intervalDays: number | null;
  lastInspectedDate: string | null;
  nextDueDate: string | null; // NULL = 都度点検
  procedureName?: string;
  equipmentName?: string;
  managementNo?: string;
  equipmentStatus?: EquipmentStatus;
  itemCount?: number;
  /** JOIN 付加（工場スコープ判定用。null = 設備の工場未設定） */
  equipmentSiteId?: string | null;
}

/** 点検記録（1回の点検実施） */
export interface InspectionRecord {
  id: string;
  equipmentId: string;
  procedureId: string | null; // 手順書削除後は null（名称はスナップショット保持）
  procedureName: string;
  inspectionDate: string;
  inspector: string;
  inspectorUserId: string | null;
  result: RecordResult;
  ngCount: number;
  notes: string | null;
  createdAt: string;
  /** 承認ワークフロー */
  approvalStatus: ApprovalStatus;
  approverUserId: string | null;
  approverName: string | null;
  approvedAt: string | null; // 承認確定の日時
  reviewComment: string | null; // 差し戻し理由など
  updatedAt: string | null;
  equipmentName?: string;
  managementNo?: string;
}

/** 項目別結果（当時の定義をスナップショット保持） */
export interface InspectionItemResult {
  id: string;
  recordId: string;
  itemId: string | null; // 数値推移の系列キー（項目アーカイブ方式なので通常は残る）
  sortOrder: number;
  itemLabel: string;
  itemType: ItemType;
  judgment: Judgment | null;
  autoJudgment: Judgment | null; // しきい値からの自動判定（上書き監査用）
  valueNumeric: number | null;
  unit: string | null;
  minValue: number | null;
  maxValue: number | null;
  valueText: string | null; // テキスト回答 / NG理由などのコメント
  photoUrl: string | null;
  createdAt: string;
}

/**
 * 設備のコンディション（最新点検＋期限＋稼働状態から導出するモニタリング用の状態）。
 * - abnormal: 最新点検が NG（異常あり）
 * - warning : 点検期限を超過（点検が遅れている）
 * - normal  : 最新点検 OK・期限内
 * - stopped : 休止中・廃止（監視対象外）
 */
export type EquipmentCondition = "abnormal" | "warning" | "normal" | "stopped";

export const CONDITION_LABEL: Record<EquipmentCondition, string> = {
  abnormal: "異常",
  warning: "注意",
  normal: "正常",
  stopped: "停止中",
};

/** メディア種別（見本・点検記録の添付） */
export type MediaType = "photo" | "audio" | "video";

export const MEDIA_TYPE_LABEL: Record<MediaType, string> = {
  photo: "写真",
  audio: "音声",
  video: "動画",
};

/** 工場（サイト。マップ画像を持つ） */
export interface Site {
  id: string;
  name: string;
  mapImageUrl: string | null;
  sortOrder: number;
  equipmentCount?: number;
  areas?: Area[];
}

/** 職場（エリア。工場配下） */
export interface Area {
  id: string;
  siteId: string;
  name: string;
  sortOrder: number;
}

/** 手順書項目の正常見本メディア */
export interface ItemReferenceMedia {
  id: string;
  itemId: string;
  mediaType: MediaType;
  url: string;
  contentType: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  caption: string | null;
  sortOrder: number;
}

/** 点検記録の項目別メディア（正常・異常どちらも） */
export interface ResultMedia {
  id: string;
  itemResultId: string;
  mediaType: MediaType;
  url: string;
  contentType: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  note: string | null;
  sortOrder: number;
}

/** 処置ステータス */
export type ActionStatus = "open" | "in_progress" | "done";

export const ACTION_STATUS_LABEL: Record<ActionStatus, string> = {
  open: "未対応",
  in_progress: "対応中",
  done: "完了",
};

/** 処置（NG項目への是正対応。recomoti の「処置の計画・実施」相当） */
export interface CorrectiveAction {
  id: string;
  equipmentId: string;
  recordId: string | null; // 起票元の点検記録（削除後は null）
  itemResultId: string | null; // 起票元の NG 項目結果（記録削除後は null）
  itemLabel: string | null; // 項目名スナップショット
  title: string;
  detail: string | null;
  assignee: string | null; // 担当者（自由入力）
  dueDate: string | null; // 対応期限 YYYY-MM-DD
  status: ActionStatus;
  resolvedNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  equipmentName?: string;
  managementNo?: string;
}

/** 点検期限の緊急度 */
export type DueLevel = "overdue" | "soon" | "ok" | "none";

export const DUE_LEVEL_LABEL: Record<DueLevel, string> = {
  overdue: "期限超過",
  soon: "期限間近",
  ok: "余裕あり",
  none: "未設定",
};
