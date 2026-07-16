import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Trash2,
  Plus,
  ChevronUp,
  ChevronDown,
  Archive,
  Save,
  Printer,
} from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getFactoryScope, isEquipmentSiteVisible } from "@/lib/factoryScope";
import {
  getProcedure,
  listInspectionItems,
  listAssignmentsForProcedure,
  listReferenceMediaForProcedure,
} from "@/lib/db";
import {
  updateProcedureAction,
  deleteProcedureAction,
  addInspectionItemAction,
  updateInspectionItemAction,
  deleteInspectionItemAction,
  moveInspectionItemAction,
} from "@/lib/actions";
import { dueLevel, daysUntil, todayJST, intervalLabel } from "@/lib/inspection";
import { formatDate } from "@/lib/format";
import type {
  InspectionProcedure,
  InspectionItem,
  EquipmentProcedure,
  ItemReferenceMedia,
} from "@/lib/types";
import { ItemTypeBadge, StatusBadge, DueBadge } from "@/components/Badges";
import PageHeader from "@/components/PageHeader";
import DbErrorState from "@/components/DbErrorState";
import SubmitButton from "@/components/SubmitButton";
import ConfirmForm from "@/components/ConfirmForm";
import ChecklistItemFields from "@/components/ChecklistItemEditor";
import ChecklistItemMediaPanel from "@/components/ChecklistItemMediaPanel";
import ProcedureDiagramUploadForm from "@/components/ProcedureDiagramUploadForm";
import ProcedureDiagramEditor from "@/components/ProcedureDiagramEditor";

export const dynamic = "force-dynamic";

const SOON_DAYS = 30;
const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

export default async function ChecklistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireEntitledSession();
  const { id } = await params;

  let data: [
    InspectionProcedure | null,
    InspectionItem[],
    EquipmentProcedure[],
    Map<string, ItemReferenceMedia[]>,
  ];
  let scope;
  try {
    [data, scope] = await Promise.all([
      Promise.all([
        getProcedure(session.companyId, id),
        listInspectionItems(session.companyId, id),
        listAssignmentsForProcedure(session.companyId, id),
        listReferenceMediaForProcedure(session.companyId, id),
      ]),
      getFactoryScope(session.companyId, session.userId),
    ]);
  } catch (e) {
    console.error("[checklist detail]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="点検手順書" />
        <DbErrorState />
      </div>
    );
  }
  const [procedure, items, allAssignments, referenceMediaMap] = data;
  // 所属工場による表示制限（割当設備の一覧は自工場の設備のみ表示）
  const assignments = scope.restricted
    ? allAssignments.filter((a) => isEquipmentSiteVisible(scope, a.equipmentSiteId ?? null))
    : allAssignments;
  if (!procedure) notFound();

  const today = todayJST();

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <Link
        href="/checklists"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        手順書一覧に戻る
      </Link>

      {/* ヘッダ */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 sm:text-2xl">{procedure.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            項目 {items.length} 件 ・ 割当設備 {assignments.length} 件 ・ 更新{" "}
            {formatDate(procedure.updatedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/checklists/${id}/print`}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            PDF印刷
          </Link>
          <ConfirmForm
            action={deleteProcedureAction.bind(null, id)}
            message="この手順書を削除しますか？割当が解除されます。点検記録がある場合は手順書はアーカイブされ履歴は残ります。"
          >
            <button className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-sm font-medium text-red-600 hover:bg-red-50">
              <Trash2 className="h-4 w-4" />
              手順書を削除
            </button>
          </ConfirmForm>
        </div>
      </div>

      {procedure.archived && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-600">
          <Archive className="h-4 w-4 shrink-0 text-slate-500" />
          この手順書はアーカイブ済みです。点検記録から参照されているため履歴は保持されています。
        </div>
      )}

      <div className="flex flex-col gap-6">
        {/* 名称・説明 */}
        <Card title="名称・説明">
          <form action={updateProcedureAction.bind(null, id)} className="rounded-xl bg-slate-50 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <LabeledField label="手順書名（必須）">
                <input name="name" defaultValue={procedure.name} required className={inputCls} />
              </LabeledField>
              <LabeledField label="説明（任意）">
                <input
                  name="description"
                  defaultValue={procedure.description ?? ""}
                  placeholder="例: 毎朝の始業前に実施する日常点検"
                  className={inputCls}
                />
              </LabeledField>
            </div>
            <div className="mt-3">
              <SubmitButton pendingText="保存中…" className="!px-3 !py-1.5 text-xs">
                <span className="inline-flex items-center gap-1">
                  <Save className="h-3.5 w-3.5" />
                  名称・説明を保存
                </span>
              </SubmitButton>
            </div>
          </form>
        </Card>

        {/* 点検項目 */}
        <Card title={`点検項目（${items.length}）`}>
          {items.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">
              まだ点検項目がありません。下のフォームから追加してください。
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((item, idx) => {
                const itemMedia = referenceMediaMap.get(item.id) ?? [];
                const nPhoto = itemMedia.filter((m) => m.mediaType === "photo").length;
                const nAudio = itemMedia.filter((m) => m.mediaType === "audio").length;
                const nVideo = itemMedia.filter((m) => m.mediaType === "video").length;
                return (
                <li key={item.id} className="rounded-xl border border-slate-200 p-3 sm:p-4">
                  <div className="flex gap-3">
                    {/* 順序操作 */}
                    <div className="flex shrink-0 flex-col items-center gap-0.5">
                      <form action={moveInspectionItemAction.bind(null, item.id, id, "up")}>
                        <MoveButton dir="up" disabled={idx === 0} />
                      </form>
                      <span className="text-xs font-semibold text-slate-400">{idx + 1}</span>
                      <form action={moveInspectionItemAction.bind(null, item.id, id, "down")}>
                        <MoveButton dir="down" disabled={idx === items.length - 1} />
                      </form>
                    </div>
                    {/* 本体 */}
                    <div className="min-w-0 flex-1">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <ItemTypeBadge type={item.itemType} />
                          <span className="truncate text-sm font-medium text-slate-800">
                            {item.label}
                          </span>
                        </div>
                        <ConfirmForm
                          action={deleteInspectionItemAction.bind(null, item.id, id)}
                          message="この項目を削除しますか？点検記録がある項目はアーカイブされ、過去の記録は残ります。"
                        >
                          <button
                            className="rounded p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                            aria-label="項目を削除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </ConfirmForm>
                      </div>
                      <form action={updateInspectionItemAction.bind(null, item.id)}>
                        <input type="hidden" name="procedureId" value={id} />
                        <ChecklistItemFields item={item} />
                        <div className="mt-3">
                          <SubmitButton pendingText="保存中…" className="!px-3 !py-1.5 text-xs">
                            <span className="inline-flex items-center gap-1">
                              <Save className="h-3.5 w-3.5" />
                              この項目を保存
                            </span>
                          </SubmitButton>
                        </div>
                      </form>
                      {/* メディアパネル（編集フォームの兄弟: form の入れ子禁止） */}
                      <details className="mt-3 rounded-xl bg-slate-50">
                        <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-medium text-slate-600 hover:text-orange-800">
                          📷 点検箇所の写真・正常見本（写真{nPhoto}・音声{nAudio}・動画
                          {nVideo}）
                        </summary>
                        <div className="px-3 pb-3">
                          <ChecklistItemMediaPanel
                            procedureId={id}
                            itemId={item.id}
                            spotPhotoUrl={item.spotPhotoUrl}
                            media={itemMedia}
                          />
                        </div>
                      </details>
                    </div>
                  </div>
                </li>
                );
              })}
            </ul>
          )}

          {/* 項目を追加 */}
          <form action={addInspectionItemAction} className="mt-4 rounded-xl bg-slate-50 p-3">
            <div className="mb-3 flex items-center gap-1.5 text-sm font-medium text-slate-600">
              <Plus className="h-4 w-4" />
              項目を追加
            </div>
            <input type="hidden" name="procedureId" value={id} />
            <ChecklistItemFields />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <SubmitButton pendingText="追加中…" className="h-11 !px-4">
                <span className="inline-flex items-center gap-1.5">
                  <Plus className="h-4 w-4" />
                  項目を追加
                </span>
              </SubmitButton>
              <span className="text-xs text-slate-400">追加した項目は末尾に並びます</span>
            </div>
          </form>
        </Card>

        {/* 点検部位マップ */}
        <Card title="点検部位マップ">
          <p className="mb-3 text-xs text-slate-500">
            設備の写真やレイアウト図をアップロードし、各点検項目が「どの部位か」を図の上にピンで示せます。点検時にも同じ図が表示され、迷わず点検できます。
          </p>
          <ProcedureDiagramUploadForm procedureId={id} diagramUrl={procedure.diagramUrl} />
          {procedure.diagramUrl && (
            <div className="mt-4">
              <ProcedureDiagramEditor
                procedureId={id}
                diagramUrl={procedure.diagramUrl}
                items={items.map((it) => ({
                  id: it.id,
                  label: it.label,
                  mapX: it.mapX,
                  mapY: it.mapY,
                }))}
              />
            </div>
          )}
        </Card>

        {/* 割当設備 */}
        <Card title={`この手順書を使う設備（${assignments.length}）`}>
          {assignments.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">
              まだ設備に割り当てられていません。設備詳細ページから割り当てると、点検スケジュールに反映されます。
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {assignments.map((a) => {
                const lv = dueLevel(a.nextDueDate, today, SOON_DAYS);
                const days = a.nextDueDate ? daysUntil(a.nextDueDate, today) : null;
                return (
                  <li key={a.id}>
                    <Link
                      href={`/equipment/${a.equipmentId}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-slate-800">
                            {a.equipmentName ?? "—"}
                          </span>
                          {a.equipmentStatus && <StatusBadge status={a.equipmentStatus} />}
                        </div>
                        <div className="truncate font-mono text-xs text-slate-400">
                          {a.managementNo ?? "—"}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                        <span>{intervalLabel(a.intervalMonths, a.intervalDays)}</span>
                        <span>次回 {formatDate(a.nextDueDate)}</span>
                        {lv !== "ok" && lv !== "none" && <DueBadge level={lv} days={days} />}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-700">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      {children}
    </div>
  );
}

function MoveButton({ dir, disabled }: { dir: "up" | "down"; disabled: boolean }) {
  const Icon = dir === "up" ? ChevronUp : ChevronDown;
  return (
    <button
      type="submit"
      disabled={disabled}
      aria-label={dir === "up" ? "上へ移動" : "下へ移動"}
      className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-orange-700 disabled:pointer-events-none disabled:text-slate-200"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
