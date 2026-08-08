import Link from "next/link";
import {
  Factory,
  AlertTriangle,
  CalendarClock,
  OctagonAlert,
  ClipboardCheck,
  Plus,
  Wrench,
} from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getUserApprovalRouting } from "@/lib/authDb";
import { getFactoryScope, scopedSiteId } from "@/lib/factoryScope";
import {
  dashboardCounts,
  listAssignmentsDue,
  listRecords,
  listCorrectiveActions,
  listSitesWithAreas,
} from "@/lib/db";
import { dueLevel, daysUntil, todayJST } from "@/lib/inspection";
import { formatDate } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import SiteFilter from "@/components/SiteFilter";
import { DueBadge, ResultBadge, ActionStatusBadge, ApprovalStatusBadge } from "@/components/Badges";
import { ShieldCheck } from "lucide-react";
import DbErrorState from "@/components/DbErrorState";

export const dynamic = "force-dynamic";

const SOON_DAYS = 30;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asUuid(v?: string): string | undefined {
  return v && UUID_RE.test(v.trim()) ? v.trim() : undefined;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; area?: string }>;
}) {
  const session = await requireEntitledSession();
  const today = todayJST();
  const sp = await searchParams;
  const areaId = asUuid(sp.area);

  let counts, dueList, records, actionList, sites, siteId;
  let lockedSiteName: string | null = null;
  try {
    // 所属工場による表示制限（制限ユーザーは工場を自工場に強制）
    const scope = await getFactoryScope(session.companyId, session.userId);
    siteId = scopedSiteId(scope, asUuid(sp.site));
    // 承認ルーティング: 管理者には「自分宛て（指名なし含む）」の承認待ちだけ数える/見せる
    const routing = await getUserApprovalRouting(session.userId);
    const approvalScope = routing?.role === "admin" ? { loginId: routing.loginId } : null;
    [counts, dueList, records, actionList, sites] = await Promise.all([
      dashboardCounts(session.companyId, today, SOON_DAYS, { siteId, areaId }, approvalScope),
      listAssignmentsDue(session.companyId, { siteId, areaId }),
      listRecords(session.companyId, { limit: 8, siteId, areaId, approvalScope }),
      // 処置カードは全社表示（工場/職場フィルタ非対応）。ただし制限ユーザーは自工場のみ
      listCorrectiveActions(session.companyId, {
        limit: 30,
        siteId: scope.restricted ? siteId : undefined,
      }),
      listSitesWithAreas(session.companyId),
    ]);
    // 制限ユーザーにはフィルタUIにも自工場のみ見せる
    if (scope.restricted) {
      sites = sites.filter((s) => s.id === scope.siteId);
      lockedSiteName = scope.factoryName;
    }
  } catch (e) {
    console.error("[dashboard]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="ダッシュボード" />
        <DbErrorState />
      </div>
    );
  }

  // 期限間近・超過の割当のみ抜粋（上位8件）
  const attention = dueList
    .map((a) => ({ a, days: a.nextDueDate ? daysUntil(a.nextDueDate, today) : null }))
    .filter(({ a }) => {
      const lv = dueLevel(a.nextDueDate, today, SOON_DAYS);
      return lv === "overdue" || lv === "soon";
    })
    .slice(0, 8);

  // 未完了の処置（期限昇順で上位8件。listCorrectiveActions は未完了を先に返す）
  const openActions = actionList.filter((a) => a.status !== "done").slice(0, 8);

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="ダッシュボード"
        description={`${session.companyName} の設備 状況サマリ`}
        action={
          <>
            <Link
              href="/equipment/new"
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" />
              設備を登録
            </Link>
            <Link
              href="/scan"
              className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-orange-700 px-3 text-sm font-semibold text-white hover:bg-orange-800"
            >
              <ClipboardCheck className="h-4 w-4" />
              点検を開始
            </Link>
          </>
        }
      />

      {/* 工場/職場での絞り込み（工場が未登録なら SiteFilter 側で非表示。制限ユーザーは所属工場に固定） */}
      {(sites.length > 0 || lockedSiteName) && (
        <div className="mb-4">
          <SiteFilter
            sites={sites}
            siteId={siteId}
            areaId={areaId}
            basePath="/"
            lockedSiteName={lockedSiteName}
          />
        </div>
      )}

      {/* 集計カード */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
        <StatCard
          label="稼働中設備"
          note="（休止中・廃止を除く）"
          value={counts.total}
          icon={Factory}
          href="/equipment"
          tone="slate"
        />
        <StatCard label="点検期限超過" value={counts.overdue} icon={AlertTriangle} href="/schedule" tone="red" />
        <StatCard label="期限間近(30日)" value={counts.soon} icon={CalendarClock} href="/schedule" tone="amber" />
        <StatCard
          label="承認待ち"
          value={counts.pendingApprovals}
          icon={ShieldCheck}
          href="/inspections?approval=pending"
          tone={counts.pendingApprovals > 0 ? "amber" : "slate"}
        />
        <StatCard label="直近30日のNG" value={counts.recentNg} icon={OctagonAlert} href="/inspections?result=fail" tone="red" />
        <StatCard
          label={counts.overdueActions > 0 ? `未完了の処置（超過${counts.overdueActions}）` : "未完了の処置"}
          value={counts.openActions}
          icon={Wrench}
          href="/actions"
          tone={counts.overdueActions > 0 ? "red" : "amber"}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* 点検期限アラート */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <CalendarClock className="h-4 w-4 text-amber-500" />
              点検期限アラート
            </h2>
            <Link href="/schedule" className="text-xs font-medium text-orange-700 hover:underline">
              すべて見る
            </Link>
          </div>
          {attention.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">期限間近・超過の点検はありません。</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {attention.map(({ a, days }) => (
                <li key={a.id}>
                  <Link href={`/equipment/${a.equipmentId}`} className="flex items-center gap-3 py-2.5 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">{a.equipmentName}</div>
                      <div className="truncate text-xs text-slate-400">
                        {a.procedureName} ・ 次回 {formatDate(a.nextDueDate)}
                      </div>
                    </div>
                    <DueBadge level={dueLevel(a.nextDueDate, today, SOON_DAYS)} days={days} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 最近の点検記録 */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <ClipboardCheck className="h-4 w-4 text-orange-500" />
              最近の点検記録
            </h2>
            <Link href="/inspections" className="text-xs font-medium text-orange-700 hover:underline">
              すべて見る
            </Link>
          </div>
          {records.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">点検記録はまだありません。</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {records.map((r) => (
                <li key={r.id}>
                  <Link href={`/inspections/${r.id}`} className="flex items-center gap-3 py-2.5 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">{r.equipmentName}</div>
                      <div className="truncate text-xs text-slate-400">
                        {r.procedureName} ・ {formatDate(r.inspectionDate)} ・ {r.inspector}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <ResultBadge result={r.result} />
                      {r.approvalStatus !== "approved" && (
                        <ApprovalStatusBadge status={r.approvalStatus} />
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 未完了の処置 */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <Wrench className="h-4 w-4 text-amber-500" />
              未完了の処置
            </h2>
            <Link href="/actions" className="text-xs font-medium text-orange-700 hover:underline">
              すべて見る
            </Link>
          </div>
          {openActions.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">未完了の処置はありません。</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {openActions.map((a) => {
                const lv = dueLevel(a.dueDate, today, SOON_DAYS);
                return (
                  <li key={a.id}>
                    <Link href={`/actions#a-${a.id}`} className="flex items-center gap-3 py-2.5 hover:bg-slate-50">
                      <ActionStatusBadge status={a.status} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-800">{a.title}</div>
                        <div className="truncate text-xs text-slate-400">
                          {a.equipmentName}
                          {a.dueDate ? ` ・ 期限 ${formatDate(a.dueDate)}` : " ・ 期限未設定"}
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
        </section>
      </div>
    </div>
  );
}

const TONE: Record<string, string> = {
  slate: "text-slate-600 bg-slate-100",
  red: "text-red-600 bg-red-50",
  amber: "text-amber-600 bg-amber-50",
};

function StatCard({
  label,
  note,
  value,
  icon: Icon,
  href,
  tone,
  className = "",
}: {
  label: string;
  note?: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  tone: keyof typeof TONE;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-2xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-sm ${className}`}
    >
      <div className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl ${TONE[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
      {note && <div className="text-[10px] text-slate-400">{note}</div>}
    </Link>
  );
}
