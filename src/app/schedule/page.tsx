import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Mail,
  MailWarning,
} from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getFactoryScope, scopedSiteId } from "@/lib/factoryScope";
import { listAssignmentsDue, listSitesWithAreas } from "@/lib/db";
import { dueLevel, daysUntil, todayJST, alertLeadDays } from "@/lib/inspection";
import { isMailConfigured } from "@/lib/mailer";
import { formatDate } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import SiteFilter from "@/components/SiteFilter";
import { DueBadge } from "@/components/Badges";
import DbErrorState from "@/components/DbErrorState";
import type { EquipmentProcedure, Site } from "@/lib/types";

export const dynamic = "force-dynamic";

const SOON_DAYS = 30;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asUuid(v?: string): string | undefined {
  return v && UUID_RE.test(v.trim()) ? v.trim() : undefined;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; area?: string }>;
}) {
  const session = await requireEntitledSession();
  const today = todayJST();
  const sp = await searchParams;
  const areaId = asUuid(sp.area);

  let list: EquipmentProcedure[];
  let sites: Site[];
  let siteId: string | undefined;
  let lockedSiteName: string | null = null;
  try {
    // 所属工場による表示制限（制限ユーザーは工場を自工場に強制）
    const scope = await getFactoryScope(session.companyId, session.userId);
    siteId = scopedSiteId(scope, asUuid(sp.site));
    [list, sites] = await Promise.all([
      listAssignmentsDue(session.companyId, { siteId, areaId }),
      listSitesWithAreas(session.companyId),
    ]);
    if (scope.restricted) {
      sites = sites.filter((s) => s.id === scope.siteId);
      lockedSiteName = scope.factoryName;
    }
  } catch (e) {
    console.error("[schedule]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="点検期限" />
        <DbErrorState />
      </div>
    );
  }

  // メール送信（Resend または SMTP）が設定済みかで案内文を切り替える
  const emailConfigured = isMailConfigured();

  const overdue = list.filter((a) => dueLevel(a.nextDueDate, today, SOON_DAYS) === "overdue");
  const soon = list.filter((a) => dueLevel(a.nextDueDate, today, SOON_DAYS) === "soon");
  const ok = list.filter((a) => dueLevel(a.nextDueDate, today, SOON_DAYS) === "ok");
  const unscheduled = list.filter((a) => !a.nextDueDate);

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="点検期限"
        description="次回点検日の自動計算と、期限が近い設備×手順書の一覧"
      />

      {/* 工場/職場での絞り込み（工場が未登録なら SiteFilter 側で非表示。制限ユーザーは所属工場に固定） */}
      {(sites.length > 0 || lockedSiteName) && (
        <div className="mb-4">
          <SiteFilter
            sites={sites}
            siteId={siteId}
            areaId={areaId}
            basePath="/schedule"
            lockedSiteName={lockedSiteName}
          />
        </div>
      )}

      {emailConfigured ? (
        <div className="mb-2 flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
          <span>
            点検期限の <strong className="text-slate-700">{alertLeadDays().join("・")}日前</strong> に、登録メールアドレス宛へアラートメールを自動送信します。
          </span>
        </div>
      ) : (
        <div className="mb-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          <MailWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>
            点検期限はこの画面で常にご確認いただけます。期限の{" "}
            <strong>{alertLeadDays().join("・")}日前</strong> のアラートメール配信は
            <strong>準備中</strong>です。担当者メール宛の配信は、送信ドメインの設定が完了し次第ご利用いただけます。
          </span>
        </div>
      )}

      <p className="mb-5 text-[11px] text-slate-400">
        ※ 休止中・廃止の設備は点検期限の対象外です（設備を稼働に戻すと再び表示されます）。
      </p>

      <Group title="期限超過" icon={AlertTriangle} tone="red" items={overdue} today={today} emptyLabel="超過している点検はありません。" />
      <Group title={`期限間近（${SOON_DAYS}日以内）`} icon={CalendarClock} tone="amber" items={soon} today={today} emptyLabel="間近の点検はありません。" />
      <Group title="予定どおり" icon={CheckCircle2} tone="emerald" items={ok} today={today} emptyLabel="該当なし。" />
      <Group title="周期未設定（都度点検）" icon={CircleDashed} tone="slate" items={unscheduled} today={today} emptyLabel="該当なし。" />
    </div>
  );
}

const TONE: Record<string, string> = {
  red: "text-red-600",
  amber: "text-amber-600",
  emerald: "text-emerald-600",
  slate: "text-slate-500",
};

function Group({
  title,
  icon: Icon,
  tone,
  items,
  today,
  emptyLabel,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof TONE;
  items: EquipmentProcedure[];
  today: string;
  emptyLabel: string;
}) {
  return (
    <section className="mb-6">
      <h2 className={`mb-2 flex items-center gap-2 text-sm font-bold ${TONE[tone]}`}>
        <Icon className="h-4 w-4" />
        {title}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white py-4 text-center text-xs text-slate-400">{emptyLabel}</p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {items.map((a) => {
            const lv = dueLevel(a.nextDueDate, today, SOON_DAYS);
            const days = a.nextDueDate ? daysUntil(a.nextDueDate, today) : null;
            return (
              <li key={a.id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                <Link href={`/equipment/${a.equipmentId}`} className="min-w-0 flex-1 -m-2 rounded-lg p-2 hover:bg-slate-50">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-800">{a.equipmentName}</span>
                    <span className="shrink-0 text-xs text-slate-400">{a.managementNo}</span>
                  </div>
                  <div className="truncate text-xs text-slate-400">
                    {a.procedureName} ・ 最終 {formatDate(a.lastInspectedDate)} ・ 次回 {formatDate(a.nextDueDate)}
                  </div>
                </Link>
                <DueBadge level={lv} days={days} />
                <Link
                  href={`/inspect/${a.id}`}
                  className="inline-flex h-11 shrink-0 items-center rounded-lg bg-orange-700 px-3 text-xs font-bold text-white hover:bg-orange-800"
                >
                  点検開始
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
