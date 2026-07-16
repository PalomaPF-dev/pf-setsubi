import Link from "next/link";
import {
  Plus,
  Search,
  Boxes,
  FileDown,
  Printer,
  Upload,
  List,
  Map as MapIcon,
  MapPinOff,
  Settings,
  LayoutDashboard,
} from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getFactoryScope, scopedSiteId } from "@/lib/factoryScope";
import {
  listEquipment,
  listSitesWithAreas,
  listEquipmentForMap,
  listEquipmentMonitoring,
  type MonitoringEquipment,
} from "@/lib/db";
import { dueLevel, daysUntil, todayJST } from "@/lib/inspection";
import { formatDate } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import { StatusBadge, DueBadge, ConditionBadge } from "@/components/Badges";
import { CONDITION_LABEL, type EquipmentCondition, type Site } from "@/lib/types";
import SiteFilter from "@/components/SiteFilter";
import FactoryMap from "@/components/FactoryMap";
import DbErrorState from "@/components/DbErrorState";

export const dynamic = "force-dynamic";

const SOON_DAYS = 30;

type ViewMode = "monitor" | "list" | "map";
const CONDITIONS: EquipmentCondition[] = ["abnormal", "warning", "normal", "stopped"];

function parseCondition(v: string | undefined): EquipmentCondition | undefined {
  return v && (CONDITIONS as string[]).includes(v) ? (v as EquipmentCondition) : undefined;
}

export default async function EquipmentListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string; site?: string; area?: string; condition?: string }>;
}) {
  const session = await requireEntitledSession();
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const areaId = sp.area || undefined;
  const condition = parseCondition(sp.condition);
  const view: ViewMode = sp.view === "map" ? "map" : sp.view === "list" ? "list" : "monitor";
  const today = todayJST();

  let sites: Site[];
  let siteId: string | undefined;
  let lockedSiteName: string | null = null;
  let listItems: Awaited<ReturnType<typeof listEquipment>> = [];
  let monRows: MonitoringEquipment[] = [];
  let mapEquipment: { site: Site; list: Awaited<ReturnType<typeof listEquipmentForMap>> } | null = null;
  try {
    // 所属工場による表示制限（制限ユーザーは工場を自工場に強制）
    const scope = await getFactoryScope(session.companyId, session.userId);
    siteId = scopedSiteId(scope, sp.site || undefined);
    sites = await listSitesWithAreas(session.companyId);
    if (scope.restricted) {
      sites = sites.filter((s) => s.id === scope.siteId);
      lockedSiteName = scope.factoryName;
    }
    if (view === "monitor") {
      monRows = await listEquipmentMonitoring(session.companyId, { siteId, areaId, search: q });
    } else if (view === "list") {
      listItems = await listEquipment(session.companyId, q, { siteId, areaId });
    } else {
      // map view: 工場未指定なら先頭の工場を表示（制限ユーザーは sites=自工場のみ）
      const mapSiteId = siteId && sites.some((s) => s.id === siteId) ? siteId : sites[0]?.id;
      mapEquipment = mapSiteId
        ? { site: sites.find((s) => s.id === mapSiteId)!, list: await listEquipmentForMap(session.companyId, mapSiteId) }
        : null;
    }
  } catch (e) {
    console.error("[equipment list]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="設備台帳" />
        <DbErrorState />
      </div>
    );
  }

  // ビュー切替・CSV/印刷リンク用のクエリ（condition は跨がない）
  const baseParams = new URLSearchParams();
  if (q) baseParams.set("q", q);
  if (siteId) baseParams.set("site", siteId);
  if (areaId) baseParams.set("area", areaId);
  const qs = baseParams.toString() ? `?${baseParams.toString()}` : "";
  const viewHref = (v: ViewMode) => {
    const p = new URLSearchParams(baseParams);
    if (v !== "monitor") p.set("view", v);
    return `/equipment${p.toString() ? `?${p.toString()}` : ""}`;
  };

  // SiteFilter の hidden で維持する既存パラメータ
  const extraParams: Record<string, string> = {};
  if (q) extraParams.q = q;
  if (view !== "monitor") extraParams.view = view;
  if (condition) extraParams.condition = condition;

  const segActive = "inline-flex items-center gap-1.5 rounded-md bg-orange-700 px-3 py-1.5 text-sm font-semibold text-white";
  const segIdle = "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100";

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="設備台帳"
        description="設備のコンディション・型式・設置場所・点検期限を一括管理"
        action={
          <>
            {(listItems.length > 0 || monRows.length > 0) && (
              <>
                <a
                  href={`/api/equipment/export${qs}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  <FileDown className="h-4 w-4" />
                  CSV出力
                </a>
                <Link
                  href={`/equipment/print${qs}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  <Printer className="h-4 w-4" />
                  PDF印刷
                </Link>
              </>
            )}
            <Link
              href="/equipment/import"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <Upload className="h-4 w-4" />
              CSVインポート
            </Link>
            <Link
              href="/equipment/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-700 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-800"
            >
              <Plus className="h-4 w-4" />
              設備を登録
            </Link>
          </>
        }
      />

      {/* 検索・絞り込み・ビュー切替 */}
      <div className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-3">
        {view !== "map" && (
          <form>
            {siteId && <input type="hidden" name="site" value={siteId} />}
            {areaId && <input type="hidden" name="area" value={areaId} />}
            {view !== "monitor" && <input type="hidden" name="view" value={view} />}
            <div className="relative w-72 max-w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                name="q"
                defaultValue={q ?? ""}
                placeholder="設備名・型式・管理番号などで検索"
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
          </form>
        )}
        <SiteFilter
          sites={sites}
          siteId={siteId}
          areaId={areaId}
          basePath="/equipment"
          extraParams={extraParams}
          lockedSiteName={lockedSiteName}
        />
        <div className="ml-auto inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
          <Link href={viewHref("monitor")} className={view === "monitor" ? segActive : segIdle}>
            <LayoutDashboard className="h-4 w-4" />
            モニタリング
          </Link>
          <Link href={viewHref("list")} className={view === "list" ? segActive : segIdle}>
            <List className="h-4 w-4" />
            リスト
          </Link>
          <Link href={viewHref("map")} className={view === "map" ? segActive : segIdle}>
            <MapIcon className="h-4 w-4" />
            マップ
          </Link>
        </div>
      </div>

      {view === "monitor" ? (
        <MonitoringView
          rows={monRows}
          sites={sites}
          siteId={siteId}
          areaId={areaId}
          condition={condition}
          baseParams={baseParams}
          today={today}
        />
      ) : view === "map" ? (
        <MapView data={mapEquipment} areaId={areaId} />
      ) : listItems.length === 0 ? (
        <EmptyState hasQuery={!!q || !!siteId || !!areaId} />
      ) : (
        <ListView items={listItems} today={today} />
      )}
    </div>
  );
}

/** モニタリングビュー：コンディション集計カード＋一覧＋工場マップ（RECOMOTI 風）。 */
function MonitoringView({
  rows,
  sites,
  siteId,
  areaId,
  condition,
  baseParams,
  today,
}: {
  rows: MonitoringEquipment[];
  sites: Site[];
  siteId?: string;
  areaId?: string;
  condition?: EquipmentCondition;
  baseParams: URLSearchParams;
  today: string;
}) {
  const counts: Record<EquipmentCondition, number> = { abnormal: 0, warning: 0, normal: 0, stopped: 0 };
  for (const e of rows) counts[e.condition]++;

  // コンディション絞り込み後の一覧
  const shown = condition ? rows.filter((e) => e.condition === condition) : rows;

  // マップ対象の工場（未指定なら先頭）と、その工場の配置済みピン
  const mapSite = siteId && sites.some((s) => s.id === siteId) ? sites.find((s) => s.id === siteId)! : sites[0] ?? null;
  const mapRows = mapSite ? rows.filter((e) => e.siteId === mapSite.id) : [];
  const placed = mapRows.filter((e) => e.mapX != null && e.mapY != null);

  // カードのリンク（condition をトグル。q/site/area は維持）
  const cardHref = (c: EquipmentCondition) => {
    const p = new URLSearchParams(baseParams);
    if (condition !== c) p.set("condition", c);
    return `/equipment${p.toString() ? `?${p.toString()}` : ""}`;
  };
  const clearHref = `/equipment${baseParams.toString() ? `?${baseParams.toString()}` : ""}`;

  return (
    <div className="flex flex-col gap-4">
      {/* コンディション集計カード */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CONDITIONS.map((c) => (
          <ConditionCard
            key={c}
            condition={c}
            count={counts[c]}
            href={condition === c ? clearHref : cardHref(c)}
            active={condition === c}
          />
        ))}
      </div>

      {condition && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>「{CONDITION_LABEL[condition]}」の設備のみ表示中</span>
          <Link href={clearHref} className="font-medium text-orange-700 hover:underline">
            すべて表示
          </Link>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        {/* 設備一覧（コンディション色分け） */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white lg:col-span-3">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
            設備一覧（{shown.length}）
          </div>
          {shown.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">
              {rows.length === 0 ? "設備が登録されていません。" : "該当するコンディションの設備はありません。"}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {shown.map((e) => (
                <MonitoringRow key={e.id} e={e} today={today} />
              ))}
            </ul>
          )}
        </div>

        {/* 工場マップ */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 lg:col-span-2">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <MapIcon className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-bold text-slate-700">工場マップ</h2>
            {mapSite && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{mapSite.name}</span>
            )}
          </div>
          {!mapSite ? (
            <MapPlaceholder text="工場がまだ登録されていません。" />
          ) : !mapSite.mapImageUrl ? (
            <MapPlaceholder text={`「${mapSite.name}」のマップ画像が未設定です。`} withSettings />
          ) : (
            <>
              <FactoryMap
                mapUrl={mapSite.mapImageUrl}
                pins={placed.map((e) => ({
                  equipmentId: e.id,
                  name: e.name,
                  managementNo: e.managementNo,
                  status: e.status,
                  condition: e.condition,
                  ngItemLabels: e.ngItemLabels,
                  x: e.mapX!,
                  y: e.mapY!,
                }))}
              />
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                {CONDITIONS.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1">
                    <span className={`h-2 w-2 rounded-full ${CONDITION_DOT[c]}`} aria-hidden />
                    {CONDITION_LABEL[c]}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const CONDITION_DOT: Record<EquipmentCondition, string> = {
  abnormal: "bg-red-500",
  warning: "bg-amber-400",
  normal: "bg-emerald-500",
  stopped: "bg-slate-400",
};

const CARD_TONE: Record<EquipmentCondition, { ring: string; text: string; bg: string }> = {
  abnormal: { ring: "ring-red-500", text: "text-red-600", bg: "bg-red-50" },
  warning: { ring: "ring-amber-400", text: "text-amber-600", bg: "bg-amber-50" },
  normal: { ring: "ring-emerald-500", text: "text-emerald-600", bg: "bg-emerald-50" },
  stopped: { ring: "ring-slate-400", text: "text-slate-500", bg: "bg-slate-100" },
};

function ConditionCard({
  condition,
  count,
  href,
  active,
}: {
  condition: EquipmentCondition;
  count: number;
  href: string;
  active: boolean;
}) {
  const tone = CARD_TONE[condition];
  return (
    <Link
      href={href}
      className={`rounded-2xl border bg-white p-4 transition-shadow hover:shadow-sm ${
        active ? `border-transparent ring-2 ${tone.ring}` : "border-slate-200"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${CONDITION_DOT[condition]}`} aria-hidden />
        <span className="text-sm font-medium text-slate-600">{CONDITION_LABEL[condition]}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`text-3xl font-bold ${count > 0 ? tone.text : "text-slate-300"}`}>{count}</span>
        <span className="text-sm text-slate-400">台</span>
      </div>
    </Link>
  );
}

const ROW_TINT: Record<EquipmentCondition, string> = {
  abnormal: "bg-red-50/60 hover:bg-red-50",
  warning: "bg-amber-50/50 hover:bg-amber-50",
  normal: "hover:bg-slate-50",
  stopped: "hover:bg-slate-50",
};

function MonitoringRow({ e, today }: { e: MonitoringEquipment; today: string }) {
  return (
    <li>
      <Link href={`/equipment/${e.id}`} className={`block px-4 py-3 transition-colors ${ROW_TINT[e.condition]}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-slate-800">{e.name}</div>
            <div className="truncate text-xs text-slate-400">
              {e.managementNo}
              {e.siteName ? ` ・ ${e.siteName}${e.areaName ? ` / ${e.areaName}` : ""}` : ""}
            </div>
          </div>
          <ConditionBadge condition={e.condition} />
        </div>

        {e.condition === "abnormal" && e.ngItemLabels.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {e.ngItemLabels.map((label, i) => (
              <span
                key={i}
                className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-inset ring-red-600/20"
              >
                {label}
              </span>
            ))}
          </div>
        )}

        <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-400">
          {e.lastInspectionDate ? (
            <span>点検日 {formatDate(e.lastInspectionDate)}</span>
          ) : (
            <span>未点検</span>
          )}
          {e.condition === "warning" && e.nextDueDate && (
            <DueBadge level="overdue" days={daysUntil(e.nextDueDate, today)} />
          )}
        </div>
      </Link>
    </li>
  );
}

function MapPlaceholder({ text, withSettings }: { text: string; withSettings?: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center">
      <MapIcon className="mx-auto mb-2 h-8 w-8 text-slate-300" />
      <p className="px-4 text-sm text-slate-500">{text}</p>
      {withSettings && (
        <Link
          href="/settings"
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-orange-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-800"
        >
          <Settings className="h-4 w-4" />
          設定で登録
        </Link>
      )}
    </div>
  );
}

/** 詳細テーブル（従来のリスト）。 */
function ListView({ items, today }: { items: Awaited<ReturnType<typeof listEquipment>>; today: string }) {
  return (
    <>
      {/* PC：テーブル */}
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white wide:block">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">管理番号</th>
              <th className="px-4 py-3 font-medium">設備名 / 型式</th>
              <th className="px-4 py-3 font-medium">メーカー</th>
              <th className="px-4 py-3 font-medium">工場 / 職場</th>
              <th className="px-4 py-3 font-medium">設置場所</th>
              <th className="px-4 py-3 font-medium">状態</th>
              <th className="px-4 py-3 font-medium">次回点検</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((e) => {
              const lv = dueLevel(e.nextDueDate, today, SOON_DAYS);
              const days = e.nextDueDate ? daysUntil(e.nextDueDate, today) : null;
              return (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/equipment/${e.id}`} className="font-mono text-xs font-medium text-orange-700 hover:underline">
                      {e.managementNo}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/equipment/${e.id}`} className="font-medium text-slate-800 hover:underline">
                      {e.name}
                    </Link>
                    <div className="text-xs text-slate-400">{e.modelNo ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{e.maker ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {e.siteName ? `${e.siteName}${e.areaName ? ` / ${e.areaName}` : ""}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{e.location ?? "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={e.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600">{formatDate(e.nextDueDate)}</span>
                      {lv !== "ok" && <DueBadge level={lv} days={days} />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* モバイル：カード */}
      <ul className="flex flex-col gap-2.5 wide:hidden">
        {items.map((e) => {
          const lv = dueLevel(e.nextDueDate, today, SOON_DAYS);
          const days = e.nextDueDate ? daysUntil(e.nextDueDate, today) : null;
          const place = [e.siteName, e.areaName].filter(Boolean).join(" / ") || e.location || "設置場所なし";
          return (
            <li key={e.id}>
              <Link
                href={`/equipment/${e.id}`}
                className="block rounded-xl border border-slate-200 bg-white p-3.5 active:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-800">{e.name}</div>
                    <div className="truncate text-xs text-slate-400">
                      {e.managementNo} ・ {e.modelNo ?? "型式なし"}
                    </div>
                  </div>
                  <StatusBadge status={e.status} />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span className="truncate">{place}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    次回 {formatDate(e.nextDueDate)}
                    {lv !== "ok" && <DueBadge level={lv} days={days} />}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** マップビュー本体（配置済みピン＋未配置リスト）。 */
function MapView({
  data,
  areaId,
}: {
  data: { site: Site; list: Awaited<ReturnType<typeof listEquipmentForMap>> } | null;
  areaId?: string;
}) {
  if (!data) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
        <MapIcon className="mx-auto mb-3 h-10 w-10 text-slate-300" />
        <p className="text-sm text-slate-500">工場がまだ登録されていません。</p>
        <Link
          href="/settings"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-orange-700 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-800"
        >
          <Settings className="h-4 w-4" />
          設定で工場を登録
        </Link>
      </div>
    );
  }

  const { site } = data;
  const list = areaId ? data.list.filter((e) => e.areaId === areaId) : data.list;

  if (!site.mapImageUrl) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
        <MapIcon className="mx-auto mb-3 h-10 w-10 text-slate-300" />
        <p className="text-sm text-slate-500">
          「{site.name}」のマップ画像が未設定です。設定ページでレイアウト図をアップロードしてください。
        </p>
        <Link
          href="/settings"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-orange-700 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-800"
        >
          <Settings className="h-4 w-4" />
          マップ画像を設定
        </Link>
      </div>
    );
  }

  const placed = list.filter((e) => e.mapX != null && e.mapY != null);
  const unplaced = list.filter((e) => e.mapX == null || e.mapY == null);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-bold text-slate-700">{site.name}</h2>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">配置済み {placed.length}台</span>
        </div>
        <FactoryMap
          mapUrl={site.mapImageUrl}
          pins={placed.map((e) => ({
            equipmentId: e.id,
            name: e.name,
            managementNo: e.managementNo,
            status: e.status,
            x: e.mapX!,
            y: e.mapY!,
          }))}
        />
        <p className="mt-2 text-xs text-slate-400">ピンをタップすると設備の概要と詳細リンクを表示します。</p>
      </div>

      {/* 未配置の設備 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-700">
          <MapPinOff className="h-4 w-4 text-slate-400" />
          未配置の設備（{unplaced.length}）
        </h2>
        {unplaced.length === 0 ? (
          <p className="py-2 text-center text-sm text-slate-400">この工場の設備はすべてマップに配置済みです。</p>
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {unplaced.map((e) => (
                <li key={e.id}>
                  <Link href={`/equipment/${e.id}`} className="flex items-center gap-3 py-2.5 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">{e.name}</div>
                      <div className="truncate text-xs text-slate-400">
                        {e.managementNo}
                        {e.areaName ? ` ・ ${e.areaName}` : ""}
                      </div>
                    </div>
                    <StatusBadge status={e.status} />
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-400">
              設備の詳細画面の「設置マップ」カードから、マップ上に配置できます。
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
      <Boxes className="mx-auto mb-3 h-10 w-10 text-slate-300" />
      <p className="text-sm text-slate-500">
        {hasQuery ? "該当する設備が見つかりませんでした。" : "まだ設備が登録されていません。"}
      </p>
      {!hasQuery && (
        <Link
          href="/equipment/new"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-orange-700 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-800"
        >
          <Plus className="h-4 w-4" />
          最初の設備を登録
        </Link>
      )}
    </div>
  );
}
