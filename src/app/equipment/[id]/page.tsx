import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  FileText,
  Download,
  ClipboardCheck,
  ClipboardList,
  CalendarPlus,
  Ban,
  RotateCcw,
  Tag,
  Settings2,
  History,
  LineChart,
  Wrench,
  MapPin,
  MapPinOff,
} from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getUserRoleAndFactory } from "@/lib/authDb";
import { getFactoryScope, isEquipmentSiteVisible } from "@/lib/factoryScope";
import {
  getEquipment,
  listCustomFieldDefs,
  listDocuments,
  listAssignmentsForEquipment,
  listRecordsForEquipment,
  listActionsForEquipment,
  listNumericItemsForEquipment,
  listNumericSeries,
  countRecordsForEquipment,
  listProcedures,
  listSitesWithAreas,
  listEquipmentForMap,
  type MapEquipment,
} from "@/lib/db";
import {
  assignProcedureAction,
  updateAssignmentAction,
  unassignProcedureAction,
  deleteDocumentAction,
  deleteEquipmentAction,
  disposeEquipmentAction,
  restoreEquipmentAction,
  clearEquipmentMapPositionAction,
} from "@/lib/actions";
import { dueLevel, daysUntil, todayJST, intervalLabel } from "@/lib/inspection";
import { formatDate, formatDateTime, formatBytes } from "@/lib/format";
import { StatusBadge, DueBadge, DocTypeBadge, ResultBadge, ActionStatusBadge } from "@/components/Badges";
import SubmitButton from "@/components/SubmitButton";
import ConfirmForm from "@/components/ConfirmForm";
import DocumentUploadForm from "@/components/DocumentUploadForm";
import TrendChart from "@/components/TrendChart";
import FactoryMap from "@/components/FactoryMap";
import FactoryMapEditor from "@/components/FactoryMapEditor";
import DbErrorState from "@/components/DbErrorState";

export const dynamic = "force-dynamic";

const SOON_DAYS = 30;
const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

export default async function EquipmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ item?: string }>;
}) {
  const session = await requireEntitledSession();
  // 設備の編集・割当・書類・状態操作などマスタ編集は管理者のみ表示（閲覧・点検開始は全員可）
  const isAdmin = ((await getUserRoleAndFactory(session.userId))?.role ?? "admin") === "admin";
  const { id } = await params;
  const { item } = await searchParams;

  let equipment, defs, documents, assignments, records, numericItems, recordCount, procedures, openActions, sites;
  let mapList: MapEquipment[] = [];
  try {
    equipment = await getEquipment(session.companyId, id);
    // 所属工場による表示制限（他工場の設備は存在しない扱い＝notFound）
    if (equipment) {
      const scope = await getFactoryScope(session.companyId, session.userId);
      if (!isEquipmentSiteVisible(scope, equipment.siteId)) equipment = null;
    }
    if (equipment) {
      [defs, documents, assignments, records, numericItems, recordCount, procedures, openActions, sites] =
        await Promise.all([
          listCustomFieldDefs(session.companyId),
          listDocuments(session.companyId, id),
          listAssignmentsForEquipment(session.companyId, id),
          listRecordsForEquipment(session.companyId, id, 10),
          listNumericItemsForEquipment(session.companyId, id),
          countRecordsForEquipment(session.companyId, id),
          listProcedures(session.companyId),
          listActionsForEquipment(session.companyId, id, { limit: 5 }),
          listSitesWithAreas(session.companyId),
        ]);
      // 設置マップ用: 工場にマップ画像があれば同じ工場の設備ピンを取得
      const eqSiteId = equipment.siteId;
      const mapSite = eqSiteId ? sites.find((s) => s.id === eqSiteId) : null;
      if (mapSite?.mapImageUrl) {
        mapList = await listEquipmentForMap(session.companyId, mapSite.id);
      }
    }
  } catch (e) {
    console.error("[equipment detail]", e);
    return (
      <div className="p-4 sm:p-6">
        <DbErrorState />
      </div>
    );
  }
  if (!equipment || !defs || !documents || !assignments || !records || !numericItems || recordCount == null || !procedures || !openActions || !sites) {
    notFound();
  }

  const today = todayJST();
  const disposed = !!equipment.disposalDate;

  // 工場/職場の名前解決（getEquipment は JOIN しないため sites から引く）
  const site = equipment.siteId ? sites.find((s) => s.id === equipment.siteId) ?? null : null;
  const area =
    site && equipment.areaId ? site.areas?.find((a) => a.id === equipment.areaId) ?? null : null;

  // 設置マップ: 自分の配置状態とピン一覧（廃止設備はマップ一覧に出ないため自分のピンは別途足す）
  const placed = equipment.mapX != null && equipment.mapY != null;
  const mapPins = mapList
    .filter((e) => e.mapX != null && e.mapY != null)
    .map((e) => ({
      equipmentId: e.id,
      name: e.name,
      managementNo: e.managementNo,
      status: e.status,
      x: e.mapX!,
      y: e.mapY!,
    }));
  if (placed && !mapPins.some((p) => p.equipmentId === id)) {
    mapPins.push({
      equipmentId: id,
      name: equipment.name,
      managementNo: equipment.managementNo,
      status: equipment.status,
      x: equipment.mapX!,
      y: equipment.mapY!,
    });
  }
  const otherPins = mapPins
    .filter((p) => p.equipmentId !== id)
    .map((p) => ({ equipmentId: p.equipmentId, name: p.name, x: p.x, y: p.y }));

  // 数値推移: 選択中の項目（未指定なら先頭）
  const selectedItemId =
    item && numericItems.some((n) => n.itemId === item) ? item : numericItems[0]?.itemId ?? null;
  const selectedItem = numericItems.find((n) => n.itemId === selectedItemId) ?? null;
  let series = null;
  if (selectedItemId) {
    try {
      series = await listNumericSeries(session.companyId, id, selectedItemId);
    } catch (e) {
      console.error("[numeric series]", e);
      series = [];
    }
  }

  // 割当追加: まだ割り当てていない手順書のみ選択肢に出す
  const assignedProcIds = new Set(assignments.map((a) => a.procedureId));
  const availableProcedures = procedures.filter((p) => !assignedProcIds.has(p.id));

  // カスタム項目値（定義と突き合わせて表示）
  const customEntries = defs
    .map((d) => ({ name: d.name, value: equipment.customValues[d.id] ?? null }))
    .filter((e) => e.value != null && e.value !== "");

  // QRコード（この端末でアクセスしたオリジンを使って絶対URLを生成）
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${h.get("host")}`;
  const qrDataUrl = await QRCode.toDataURL(`${origin}/equipment/${id}`, { width: 220, margin: 1 });

  const photoDocs = documents.filter((d) => d.docType === "photo");
  const fileDocs = documents.filter((d) => d.docType !== "photo");

  const deleteMessage =
    recordCount > 0
      ? `【完全削除】この設備と、写真・書類・手順書の割当に加えて、点検記録${recordCount}件も削除されます。点検記録は復元できません。記録を残す場合は「廃止」をご利用ください。本当に完全削除しますか？`
      : "【完全削除】この設備と、写真・書類・手順書の割当をすべて完全に削除します。通常は「廃止」をご利用ください。本当に完全削除しますか？";

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <Link href="/equipment" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        台帳に戻る
      </Link>

      {/* ヘッダ */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-800 sm:text-2xl">{equipment.name}</h1>
            <StatusBadge status={equipment.status} />
          </div>
          <p className="mt-1 font-mono text-sm text-slate-400">{equipment.managementNo}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Link
              href={`/equipment/${id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <Pencil className="h-4 w-4" />
              編集
            </Link>
          )}
        </div>
      </div>

      {disposed && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-600">
          <Ban className="h-4 w-4 shrink-0 text-slate-500" />
          この設備は <strong className="mx-1">{formatDate(equipment.disposalDate)}</strong> に廃止されています。点検記録は保持されています。
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 左：基本情報＋点検手順書＋数値推移＋点検履歴＋写真・書類 */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* 基本情報 */}
          <Card title="基本情報">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
              <Info label="カテゴリ" value={equipment.category} />
              <Info label="メーカー" value={equipment.maker} />
              <Info label="型式" value={equipment.modelNo} />
              <Info label="製造番号" value={equipment.serialNo} />
              <Info label="工場" value={site?.name} />
              <Info label="職場" value={area?.name} />
              <Info label="詳細位置" value={equipment.location} />
              <Info label="導入日" value={equipment.installedDate ? formatDate(equipment.installedDate) : null} />
              {disposed && <Info label="廃止日" value={formatDate(equipment.disposalDate)} />}
              {customEntries.map((c) => (
                <Info key={c.name} label={c.name} value={c.value} />
              ))}
            </dl>
            {equipment.notes && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <div className="text-xs text-slate-400">備考</div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{equipment.notes}</p>
              </div>
            )}
          </Card>

          {/* 点検手順書（割当） */}
          <Card title="点検手順書">
            {assignments.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">
                まだ点検手順書が割り当てられていません。下のフォームから割り当てると、周期に沿って点検期限を管理できます。
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {assignments.map((a) => {
                  const lv = dueLevel(a.nextDueDate, today, SOON_DAYS);
                  const days = a.nextDueDate ? daysUntil(a.nextDueDate, today) : null;
                  return (
                    <li key={a.id} className="py-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <ClipboardList className="h-4 w-4 shrink-0 text-slate-400" />
                            <span className="truncate text-sm font-medium text-slate-800">
                              {a.procedureName}
                            </span>
                            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                              {intervalLabel(a.intervalMonths, a.intervalDays)}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                            <span>最終点検 {formatDate(a.lastInspectedDate)}</span>
                            <span className="flex items-center gap-1.5">
                              次回 {formatDate(a.nextDueDate)}
                              {lv !== "ok" && <DueBadge level={lv} days={days} />}
                            </span>
                          </div>
                        </div>
                        <Link
                          href={`/inspect/${a.id}`}
                          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-orange-700 px-4 text-sm font-semibold text-white hover:bg-orange-800"
                        >
                          <ClipboardCheck className="h-4 w-4" />
                          点検開始
                        </Link>
                      </div>

                      {/* 周期編集（インライン）＝マスタ設定＝管理者のみ */}
                      {isAdmin && (
                      <details className="mt-2">
                        <summary className="inline-flex cursor-pointer items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
                          <Settings2 className="h-3.5 w-3.5" />
                          周期・点検日を編集
                        </summary>
                        <form action={updateAssignmentAction.bind(null, a.id)} className="mt-2 rounded-xl bg-slate-50 p-3">
                          <input type="hidden" name="equipmentId" value={id} />
                          <div className="grid gap-3 sm:grid-cols-4">
                            <LabeledField label="周期">
                              <input
                                type="number"
                                name="intervalValue"
                                min={1}
                                defaultValue={a.intervalMonths ?? a.intervalDays ?? ""}
                                placeholder="空欄=都度"
                                className={inputCls}
                              />
                            </LabeledField>
                            <LabeledField label="単位">
                              <select name="intervalUnit" defaultValue={a.intervalDays ? "days" : "months"} className={inputCls}>
                                <option value="months">か月ごと</option>
                                <option value="days">日ごと</option>
                              </select>
                            </LabeledField>
                            <LabeledField label="最終点検日">
                              <input type="date" name="lastInspectedDate" defaultValue={a.lastInspectedDate ?? ""} className={inputCls} />
                            </LabeledField>
                            <LabeledField label="次回点検日（直接指定）">
                              <input type="date" name="nextDueDate" defaultValue={a.nextDueDate ?? ""} className={inputCls} />
                            </LabeledField>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <SubmitButton pendingText="保存中…" className="!px-3 !py-1.5 text-xs">
                              変更を保存
                            </SubmitButton>
                            <span className="text-xs text-slate-400">
                              次回点検日を空欄にすると「最終点検日＋周期」で自動計算されます
                            </span>
                          </div>
                        </form>
                        {/* 割当解除は編集フォームの外（form の入れ子は不正HTML） */}
                        <ConfirmForm
                          action={unassignProcedureAction.bind(null, a.id, id)}
                          message={`「${a.procedureName ?? ""}」の割当を解除しますか？（点検記録は残ります）`}
                          className="mt-2 flex justify-end"
                        >
                          <button className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                            割当を解除
                          </button>
                        </ConfirmForm>
                      </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {/* 割当追加＝マスタ設定＝管理者のみ */}
            {isAdmin && (availableProcedures.length > 0 ? (
              <form action={assignProcedureAction} className="mt-4 rounded-xl bg-slate-50 p-3">
                <div className="mb-2 text-xs font-medium text-slate-500">手順書を割り当てる</div>
                <input type="hidden" name="equipmentId" value={id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <LabeledField label="点検手順書">
                    <select name="procedureId" required className={inputCls} defaultValue="">
                      <option value="" disabled>
                        選択してください
                      </option>
                      {availableProcedures.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}（{p.itemCount ?? 0}項目）
                        </option>
                      ))}
                    </select>
                  </LabeledField>
                  <div className="grid grid-cols-2 gap-3">
                    <LabeledField label="周期">
                      <input type="number" name="intervalValue" min={1} placeholder="空欄=都度" className={inputCls} />
                    </LabeledField>
                    <LabeledField label="単位">
                      <select name="intervalUnit" defaultValue="months" className={inputCls}>
                        <option value="months">か月ごと</option>
                        <option value="days">日ごと</option>
                      </select>
                    </LabeledField>
                  </div>
                  <LabeledField label="最終点検日（任意・導入時の移行用）">
                    <input type="date" name="lastInspectedDate" className={inputCls} />
                  </LabeledField>
                  <LabeledField label="次回点検日（任意・導入時の移行用）">
                    <input type="date" name="nextDueDate" className={inputCls} />
                  </LabeledField>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <SubmitButton pendingText="割当中…" className="!px-3 !py-1.5 text-xs">
                    <span className="inline-flex items-center gap-1">
                      <CalendarPlus className="h-3.5 w-3.5" />
                      割り当てる
                    </span>
                  </SubmitButton>
                  <span className="text-xs text-slate-400">
                    次回点検日は「最終点検日（未入力なら今日）＋周期」で自動計算されます
                  </span>
                </div>
              </form>
            ) : (
              procedures.length === 0 && (
                <div className="mt-4 rounded-xl bg-slate-50 p-3 text-center text-sm text-slate-500">
                  点検手順書がまだありません。
                  <Link href="/checklists" className="ml-1 font-medium text-orange-700 hover:underline">
                    点検手順書を作成
                  </Link>
                </div>
              )
            ))}
          </Card>

          {/* 数値推移 */}
          {numericItems.length > 0 && (
            <Card
              title="数値推移"
              badge={
                <form method="GET" className="flex items-center gap-2">
                  <LineChart className="h-4 w-4 text-orange-500" />
                  <select
                    name="item"
                    defaultValue={selectedItemId ?? ""}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs focus:border-orange-500 focus:outline-none"
                  >
                    {numericItems.map((n) => (
                      <option key={n.itemId} value={n.itemId}>
                        {n.label}
                        {n.unit ? `（${n.unit}）` : ""} ・ {n.count}件
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    表示
                  </button>
                </form>
              }
            >
              <TrendChart points={series ?? []} unit={selectedItem?.unit ?? null} />
            </Card>
          )}

          {/* この設備の点検履歴 */}
          <Card
            title="この設備の点検履歴"
            badge={
              records.length > 0 ? (
                <Link
                  href={`/inspections?equipment=${id}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 hover:underline"
                >
                  <History className="h-3.5 w-3.5" />
                  すべて見る
                </Link>
              ) : undefined
            }
          >
            {records.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">点検記録はまだありません。</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {records.map((r) => (
                  <li key={r.id}>
                    <Link href={`/inspections/${r.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:bg-slate-50">
                      <ResultBadge result={r.result} />
                      <div className="min-w-0 flex-1">
                        <div className="text-slate-800">
                          {formatDate(r.inspectionDate)}
                          <span className="ml-2 text-slate-500">{r.procedureName}</span>
                        </div>
                        <div className="truncate text-xs text-slate-400">
                          点検者: {r.inspector}
                          {r.ngCount > 0 ? ` ・ NG ${r.ngCount}件` : ""}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* 処置（是正対応） */}
          <Card
            title="処置（是正対応）"
            badge={
              <Link
                href={`/actions?equipment=${id}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 hover:underline"
              >
                <Wrench className="h-3.5 w-3.5" />
                すべて見る
              </Link>
            }
          >
            {openActions.length === 0 ? (
              <div className="py-4 text-center text-sm text-slate-400">
                未完了の処置はありません。
                <Link
                  href={`/actions/new?equipment=${id}`}
                  className="ml-2 font-medium text-orange-700 hover:underline"
                >
                  処置を登録
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {openActions.map((a) => {
                  const lv = dueLevel(a.dueDate, today);
                  return (
                    <li key={a.id}>
                      <Link
                        href={`/actions#a-${a.id}`}
                        className="flex items-center gap-3 py-2.5 text-sm hover:bg-slate-50"
                      >
                        <ActionStatusBadge status={a.status} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-slate-800">{a.title}</div>
                          <div className="truncate text-xs text-slate-400">
                            {a.itemLabel ? `起票元: ${a.itemLabel} ・ ` : ""}
                            担当: {a.assignee ?? "未定"}
                            {a.dueDate ? ` ・ 期限 ${formatDate(a.dueDate)}` : ""}
                          </div>
                        </div>
                        {(lv === "overdue" || lv === "soon") && a.dueDate && (
                          <DueBadge level={lv} days={daysUntil(a.dueDate, today)} />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* 写真・書類 */}
          <Card title="写真・書類（設備写真・取扱説明書・図面 など）">
            {isAdmin && <DocumentUploadForm equipmentId={id} />}

            {/* 設備写真のサムネイルグリッド */}
            {photoDocs.length > 0 && (
              <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photoDocs.map((d) => (
                  <div key={d.id} className="group relative overflow-hidden rounded-lg border border-slate-200">
                    <a href={d.blobUrl} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={d.blobUrl} alt={d.title} className="aspect-square w-full object-cover" />
                    </a>
                    <div className="flex items-center justify-between gap-1 bg-white px-1.5 py-1">
                      <span className="truncate text-[10px] text-slate-500">{d.title}</span>
                      {isAdmin && (
                        <ConfirmForm action={deleteDocumentAction.bind(null, d.id, id)} message="この写真を削除しますか？">
                          <button className="rounded p-0.5 text-slate-300 hover:bg-red-50 hover:text-red-500" aria-label="削除">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </ConfirmForm>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {fileDocs.length === 0 && photoDocs.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">写真・書類はまだ添付されていません。</p>
            ) : (
              fileDocs.length > 0 && (
                <ul className="divide-y divide-slate-100">
                  {fileDocs.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 py-2.5">
                      <FileText className="h-5 w-5 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <DocTypeBadge type={d.docType} />
                          <span className="truncate text-sm font-medium text-slate-800">{d.title}</span>
                        </div>
                        <div className="truncate text-xs text-slate-400">
                          {d.fileName} ・ {formatBytes(d.sizeBytes)} ・ {formatDateTime(d.uploadedAt)}
                        </div>
                      </div>
                      <a
                        href={d.blobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-orange-700"
                        aria-label="開く"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                      {isAdmin && (
                        <ConfirmForm action={deleteDocumentAction.bind(null, d.id, id)} message="この書類を削除しますか？">
                          <button className="rounded p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500" aria-label="削除">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </ConfirmForm>
                      )}
                    </li>
                  ))}
                </ul>
              )
            )}
          </Card>
        </div>

        {/* 右：設置マップ＋QR＋状態操作 */}
        <div className="flex flex-col gap-6">
          {/* 設置マップ */}
          <Card title="設置マップ">
            {!site ? (
              <p className="text-sm text-slate-400">
                工場が未設定です。
                <Link href={`/equipment/${id}/edit`} className="mx-1 font-medium text-orange-700 hover:underline">
                  編集
                </Link>
                から工場・職場を設定すると、マップにピンで配置できます。
              </p>
            ) : !site.mapImageUrl ? (
              <p className="text-sm text-slate-400">
                「{site.name}」のマップ画像が未設定です。
                <Link href="/settings" className="mx-1 font-medium text-orange-700 hover:underline">
                  設定
                </Link>
                でレイアウト図をアップロードすると、ピンで配置できます。
              </p>
            ) : placed ? (
              <>
                <FactoryMap mapUrl={site.mapImageUrl} pins={mapPins} highlightId={id} />
                {isAdmin && (
                  <>
                    <details className="mt-3">
                      <summary className="inline-flex cursor-pointer items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
                        <MapPin className="h-3.5 w-3.5" />
                        位置を変更
                      </summary>
                      <div className="mt-2 rounded-xl bg-slate-50 p-3">
                        <FactoryMapEditor
                          equipmentId={id}
                          factory={{ id: site.id, name: site.name, mapUrl: site.mapImageUrl }}
                          otherPins={otherPins}
                          current={{ x: equipment.mapX!, y: equipment.mapY! }}
                        />
                      </div>
                    </details>
                    <ConfirmForm
                      action={clearEquipmentMapPositionAction.bind(null, id)}
                      message="マップへの配置を解除しますか？（設備や工場/職場の設定はそのまま残ります）"
                      className="mt-2"
                    >
                      <button className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                        <MapPinOff className="h-3.5 w-3.5" />
                        配置を解除
                      </button>
                    </ConfirmForm>
                  </>
                )}
              </>
            ) : isAdmin ? (
              <details>
                <summary className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-orange-300 text-sm font-medium text-orange-700 hover:bg-orange-50">
                  <MapPin className="h-4 w-4" />
                  マップに配置
                </summary>
                <div className="mt-3 rounded-xl bg-slate-50 p-3">
                  <FactoryMapEditor
                    equipmentId={id}
                    factory={{ id: site.id, name: site.name, mapUrl: site.mapImageUrl }}
                    otherPins={otherPins}
                    current={null}
                  />
                </div>
              </details>
            ) : (
              <p className="text-sm text-slate-400">この設備はまだマップに配置されていません。</p>
            )}
          </Card>

          {/* QRコード */}
          <Card title="QRコード">
            <div className="flex flex-col items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="設備QRコード" className="h-44 w-44 rounded-lg border border-slate-100" />
              <p className="text-center text-xs text-slate-400">
                スキャンでこの画面を開けます。現場の点検開始に便利です。
              </p>
              <Link
                href={`/equipment/${id}/label`}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                <Tag className="h-4 w-4" />
                ラベル印刷（テプラ）
              </Link>
            </div>
          </Card>

          {/* 状態操作（廃止・復元・削除）＝マスタ設定＝管理者のみ */}
          {isAdmin && (
          <Card title="状態操作">
            <div className="flex flex-col gap-2.5">
              {disposed ? (
                <ConfirmForm action={restoreEquipmentAction.bind(null, id)} message="廃止を取り消して稼働中に戻しますか？">
                  <button className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50">
                    <RotateCcw className="h-4 w-4" />
                    廃止を取り消す（復元）
                  </button>
                </ConfirmForm>
              ) : (
                <ConfirmForm action={disposeEquipmentAction.bind(null, id)} message="この設備を廃止しますか？（設備情報・点検記録は保持され、点検期限の管理対象から外れます）">
                  <button className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-amber-300 text-sm font-medium text-amber-700 hover:bg-amber-50">
                    <Ban className="h-4 w-4" />
                    廃止する
                  </button>
                </ConfirmForm>
              )}
              <ConfirmForm action={deleteEquipmentAction.bind(null, id)} message={deleteMessage}>
                <button className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50">
                  <Trash2 className="h-4 w-4" />
                  完全削除
                </button>
              </ConfirmForm>
              <p className="text-xs text-slate-400">
                使わなくなった設備は「廃止」がおすすめです。点検記録
                {recordCount > 0 ? `（${recordCount}件）` : ""}
                を残したまま管理対象から外せます。
              </p>
            </div>
          </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-700">{title}</h2>
        {badge}
      </div>
      {children}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-slate-700">{value || "—"}</dd>
    </div>
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
