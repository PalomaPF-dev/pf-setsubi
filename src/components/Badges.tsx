import {
  EQUIPMENT_STATUS_LABEL,
  DOC_TYPE_LABEL,
  DUE_LEVEL_LABEL,
  RECORD_RESULT_LABEL,
  ITEM_TYPE_LABEL,
  ACTION_STATUS_LABEL,
  APPROVAL_STATUS_LABEL,
  CONDITION_LABEL,
  type EquipmentStatus,
  type DocType,
  type DueLevel,
  type RecordResult,
  type ItemType,
  type Judgment,
  type ActionStatus,
  type ApprovalStatus,
  type EquipmentCondition,
} from "@/lib/types";

const CONDITION_STYLE: Record<EquipmentCondition, string> = {
  abnormal: "bg-red-50 text-red-700 ring-red-600/20",
  warning: "bg-amber-50 text-amber-700 ring-amber-600/20",
  normal: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  stopped: "bg-slate-100 text-slate-500 ring-slate-500/20",
};

const CONDITION_DOT: Record<EquipmentCondition, string> = {
  abnormal: "bg-red-500",
  warning: "bg-amber-400",
  normal: "bg-emerald-500",
  stopped: "bg-slate-400",
};

/** 設備コンディション（異常/注意/正常/停止中）のバッジ（色ドット付き）。 */
export function ConditionBadge({ condition }: { condition: EquipmentCondition }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${CONDITION_STYLE[condition]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${CONDITION_DOT[condition]}`} aria-hidden />
      {CONDITION_LABEL[condition]}
    </span>
  );
}

const STATUS_STYLE: Record<EquipmentStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  stopped: "bg-slate-100 text-slate-600 ring-slate-500/20",
  repair: "bg-amber-50 text-amber-700 ring-amber-600/20",
  retired: "bg-slate-100 text-slate-500 ring-slate-500/20",
};

export function StatusBadge({ status }: { status: EquipmentStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[status]}`}
    >
      {EQUIPMENT_STATUS_LABEL[status]}
    </span>
  );
}

const DUE_STYLE: Record<DueLevel, string> = {
  overdue: "bg-red-50 text-red-700 ring-red-600/20",
  soon: "bg-amber-50 text-amber-700 ring-amber-600/20",
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  none: "bg-slate-100 text-slate-500 ring-slate-500/20",
};

export function DueBadge({ level, days }: { level: DueLevel; days?: number | null }) {
  let label: string = DUE_LEVEL_LABEL[level];
  if (level === "overdue" && days != null) label = `${Math.abs(days)}日超過`;
  else if (level === "soon" && days != null) label = `あと${days}日`;
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${DUE_STYLE[level]}`}
    >
      {label}
    </span>
  );
}

const DOC_STYLE: Record<DocType, string> = {
  photo: "bg-sky-50 text-sky-700 ring-sky-600/20",
  manual: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  drawing: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  other: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

export function DocTypeBadge({ type }: { type: DocType }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${DOC_STYLE[type]}`}
    >
      {DOC_TYPE_LABEL[type]}
    </span>
  );
}

const RESULT_STYLE: Record<RecordResult, string> = {
  pass: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  fail: "bg-red-50 text-red-700 ring-red-600/20",
};

/** 点検記録の総合結果（OK/NG）。 */
export function ResultBadge({ result }: { result: RecordResult }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${RESULT_STYLE[result]}`}
    >
      {RECORD_RESULT_LABEL[result]}
    </span>
  );
}

/** 項目別の判定（OK/NG/該当なし/判定なし）。 */
export function JudgmentBadge({ judgment }: { judgment: Judgment | null }) {
  if (!judgment || judgment === "na") {
    return (
      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-inset ring-slate-500/20">
        {judgment === "na" ? "該当なし" : "—"}
      </span>
    );
  }
  return <ResultBadge result={judgment === "ok" ? "pass" : "fail"} />;
}

const ACTION_STATUS_STYLE: Record<ActionStatus, string> = {
  open: "bg-red-50 text-red-700 ring-red-600/20",
  in_progress: "bg-amber-50 text-amber-700 ring-amber-600/20",
  done: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

/** 処置の状態（未対応/対応中/完了）。 */
export function ActionStatusBadge({ status }: { status: ActionStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${ACTION_STATUS_STYLE[status]}`}
    >
      {ACTION_STATUS_LABEL[status]}
    </span>
  );
}

const APPROVAL_STATUS_STYLE: Record<ApprovalStatus, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  returned: "bg-red-50 text-red-700 ring-red-600/20",
};

const APPROVAL_STATUS_DOT: Record<ApprovalStatus, string> = {
  pending: "bg-amber-400",
  approved: "bg-emerald-500",
  returned: "bg-red-500",
};

/** 点検記録の承認状態（承認待ち/承認済み/差し戻し）。 */
export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${APPROVAL_STATUS_STYLE[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${APPROVAL_STATUS_DOT[status]}`} aria-hidden />
      {APPROVAL_STATUS_LABEL[status]}
    </span>
  );
}

const ITEM_TYPE_STYLE: Record<ItemType, string> = {
  ok_ng: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  numeric: "bg-sky-50 text-sky-700 ring-sky-600/20",
  text: "bg-slate-100 text-slate-600 ring-slate-500/20",
  photo: "bg-orange-50 text-orange-700 ring-orange-600/20",
};

export function ItemTypeBadge({ type }: { type: ItemType }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${ITEM_TYPE_STYLE[type]}`}
    >
      {ITEM_TYPE_LABEL[type]}
    </span>
  );
}
