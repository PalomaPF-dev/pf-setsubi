import Link from "next/link";
import { Plus, Wrench, CircleDashed, CheckCircle2, AlertTriangle } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getFactoryScope, scopedSiteId } from "@/lib/factoryScope";
import { listCorrectiveActions, listEquipment } from "@/lib/db";
import {
  updateCorrectiveActionAction,
  completeCorrectiveActionAction,
  reopenCorrectiveActionAction,
  deleteCorrectiveActionAction,
} from "@/lib/actions";
import { dueLevel, daysUntil, todayJST } from "@/lib/inspection";
import { formatDate } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import { ActionStatusBadge, DueBadge } from "@/components/Badges";
import SubmitButton from "@/components/SubmitButton";
import ConfirmForm from "@/components/ConfirmForm";
import DbErrorState from "@/components/DbErrorState";
import type { CorrectiveAction, ActionStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

function asUuid(v: string | undefined): string | undefined {
  return v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    ? v
    : undefined;
}

export default async function ActionsPage({
  searchParams,
}: {
  searchParams: Promise<{ equipment?: string; status?: string }>;
}) {
  const session = await requireEntitledSession();
  const sp = await searchParams;
  const equipmentId = asUuid(sp.equipment);
  const statusFilter: ActionStatus | undefined =
    sp.status === "open" || sp.status === "in_progress" || sp.status === "done"
      ? sp.status
      : undefined;

  let open: CorrectiveAction[], inProgress: CorrectiveAction[], done: CorrectiveAction[], equipment;
  try {
    // 所属工場による表示制限（制限ユーザーは自工場の処置・設備のみ）
    const scope = await getFactoryScope(session.companyId, session.userId);
    const siteId = scopedSiteId(scope);
    [open, inProgress, done, equipment] = await Promise.all([
      listCorrectiveActions(session.companyId, { equipmentId, status: "open", siteId }),
      listCorrectiveActions(session.companyId, { equipmentId, status: "in_progress", siteId }),
      listCorrectiveActions(session.companyId, {
        equipmentId,
        status: "done",
        limit: statusFilter === "done" ? 100 : 10,
        siteId,
      }),
      listEquipment(session.companyId, undefined, { siteId }),
    ]);
  } catch (e) {
    console.error("[actions]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="処置管理" />
        <DbErrorState />
      </div>
    );
  }

  const today = todayJST();

  // 絞り込みなしで処置が1件もない場合は、NG点検との関係が分かる空状態を出す
  const showGuide =
    !statusFilter &&
    !equipmentId &&
    open.length === 0 &&
    inProgress.length === 0 &&
    done.length === 0;

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="処置管理"
        description="点検NGへの是正対応を計画・実施・完了まで管理します"
        action={
          <Link
            href={equipmentId ? `/actions/new?equipment=${equipmentId}` : "/actions/new"}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-orange-700 px-3 text-sm font-semibold text-white hover:bg-orange-800"
          >
            <Plus className="h-4 w-4" />
            処置を登録
          </Link>
        }
      />

      {showGuide && (
        <div className="mb-6 rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center">
          <Wrench className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">処置はまだありません</p>
          <p className="mx-auto mt-1 max-w-sm px-4 text-sm text-slate-500">
            処置は点検でNGになった項目から登録できます。点検記録のNG項目の「処置を登録」から起票してください。
          </p>
          <Link
            href="/inspections?result=fail"
            className="mt-4 inline-flex h-11 items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-4 text-sm font-semibold text-orange-700 hover:bg-orange-100"
          >
            NGの点検記録を見る
          </Link>
        </div>
      )}

      {!showGuide && (
        <>
      {/* フィルタ */}
      <form method="GET" className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">設備</span>
          <select name="equipment" defaultValue={equipmentId ?? ""} className={inputCls}>
            <option value="">すべて</option>
            {equipment.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}（{e.managementNo}）
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">状態</span>
          <select name="status" defaultValue={statusFilter ?? ""} className={inputCls}>
            <option value="">すべて</option>
            <option value="open">未対応</option>
            <option value="in_progress">対応中</option>
            <option value="done">完了</option>
          </select>
        </label>
        <div className="flex gap-2">
          <button className="h-[38px] rounded-lg bg-orange-700 px-4 text-sm font-semibold text-white hover:bg-orange-800">
            絞り込む
          </button>
          <Link
            href="/actions"
            className="inline-flex h-[38px] items-center rounded-lg border border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-50"
          >
            クリア
          </Link>
        </div>
      </form>

      <div className="flex flex-col gap-6">
        {(!statusFilter || statusFilter === "open") && (
          <Group
            title="未対応"
            count={open.length}
            icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
          >
            {open.length === 0 ? (
              <Empty text="未対応の処置はありません。" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {open.map((a) => (
                  <ActionRow key={a.id} action={a} today={today} />
                ))}
              </ul>
            )}
          </Group>
        )}

        {(!statusFilter || statusFilter === "in_progress") && (
          <Group
            title="対応中"
            count={inProgress.length}
            icon={<CircleDashed className="h-4 w-4 text-amber-500" />}
          >
            {inProgress.length === 0 ? (
              <Empty text="対応中の処置はありません。" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {inProgress.map((a) => (
                  <ActionRow key={a.id} action={a} today={today} />
                ))}
              </ul>
            )}
          </Group>
        )}

        {(!statusFilter || statusFilter === "done") && (
          <Group
            title={statusFilter === "done" ? "完了" : "完了（直近10件）"}
            count={done.length}
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            badge={
              statusFilter !== "done" && done.length >= 10 ? (
                <Link
                  href={equipmentId ? `/actions?status=done&equipment=${equipmentId}` : "/actions?status=done"}
                  className="text-xs font-medium text-orange-700 hover:underline"
                >
                  すべて見る
                </Link>
              ) : undefined
            }
          >
            {done.length === 0 ? (
              <Empty text="完了した処置はありません。" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {done.map((a) => (
                  <ActionRow key={a.id} action={a} today={today} />
                ))}
              </ul>
            )}
          </Group>
        )}
      </div>
        </>
      )}
    </div>
  );
}

function Group({
  title,
  count,
  icon,
  badge,
  children,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700">
          {icon}
          {title}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
            {count}
          </span>
        </h2>
        {badge}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-slate-400">{text}</p>;
}

/** 処置1件の行。未完了は一覧内インラインで編集・完了できる（既存の割当編集と同型）。 */
function ActionRow({ action: a, today }: { action: CorrectiveAction; today: string }) {
  const lv = dueLevel(a.dueDate, today);
  const isDone = a.status === "done";
  return (
    <li id={`a-${a.id}`} className="scroll-mt-24 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <ActionStatusBadge status={a.status} />
        <span className="font-medium text-slate-800">{a.title}</span>
        {!isDone && (lv === "overdue" || lv === "soon") && a.dueDate && (
          <DueBadge level={lv} days={daysUntil(a.dueDate, today)} />
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
        <Link href={`/equipment/${a.equipmentId}`} className="text-orange-700 hover:underline">
          {a.equipmentName}（{a.managementNo}）
        </Link>
        {a.itemLabel &&
          (a.recordId ? (
            <Link href={`/inspections/${a.recordId}`} className="hover:underline">
              起票元: {a.itemLabel}
            </Link>
          ) : (
            <span>起票元: {a.itemLabel}</span>
          ))}
        <span>担当: {a.assignee ?? "未定"}</span>
        <span>期限: {a.dueDate ? formatDate(a.dueDate) : "未設定"}</span>
      </div>
      {a.detail && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{a.detail}</p>}

      {!isDone ? (
        <>
          {/* 編集（インライン） */}
          <details className="mt-2">
            <summary className="inline-flex cursor-pointer items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
              <Wrench className="h-3.5 w-3.5" />
              内容を編集
            </summary>
            <form
              action={updateCorrectiveActionAction.bind(null, a.id)}
              className="mt-2 rounded-xl bg-slate-50 p-3"
            >
              <input type="hidden" name="equipmentId" value={a.equipmentId} />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-slate-500">タイトル（必須）</span>
                  <input name="title" defaultValue={a.title} required className={inputCls} />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-slate-500">内容・対応方針</span>
                  <textarea name="detail" defaultValue={a.detail ?? ""} rows={2} className={inputCls} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">担当者</span>
                  <input name="assignee" defaultValue={a.assignee ?? ""} className={inputCls} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">対応期限</span>
                  <input type="date" name="dueDate" defaultValue={a.dueDate ?? ""} className={inputCls} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">状態</span>
                  <select name="status" defaultValue={a.status} className={inputCls}>
                    <option value="open">未対応</option>
                    <option value="in_progress">対応中</option>
                  </select>
                </label>
              </div>
              <div className="mt-3">
                <SubmitButton pendingText="保存中…" className="!px-3 !py-1.5 text-xs">
                  変更を保存
                </SubmitButton>
              </div>
            </form>
          </details>

          {/* 完了と削除は兄弟要素にする（form の入れ子は不正HTML） */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <form
              action={completeCorrectiveActionAction.bind(null, a.id)}
              className="flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="equipmentId" value={a.equipmentId} />
              <input
                name="resolvedNote"
                placeholder="対応内容（任意）"
                className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
              <SubmitButton
                pendingText="完了処理中…"
                className="!bg-emerald-600 !px-3 !py-1.5 text-xs hover:!bg-emerald-700"
              >
                完了にする
              </SubmitButton>
            </form>
            <ConfirmForm
              action={deleteCorrectiveActionAction.bind(null, a.id, a.equipmentId)}
              message={`処置「${a.title}」を削除しますか？元に戻せません。`}
              className="ml-auto"
            >
              <button className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                削除
              </button>
            </ConfirmForm>
          </div>
        </>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="text-xs text-slate-500">
            {a.resolvedAt && <span>完了日: {formatDate(a.resolvedAt.slice(0, 10))}</span>}
            {a.resolvedNote && <span className="ml-2">対応内容: {a.resolvedNote}</span>}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ConfirmForm
              action={reopenCorrectiveActionAction.bind(null, a.id, a.equipmentId)}
              message={`処置「${a.title}」を対応中に戻しますか？`}
            >
              <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                未完了に戻す
              </button>
            </ConfirmForm>
            <ConfirmForm
              action={deleteCorrectiveActionAction.bind(null, a.id, a.equipmentId)}
              message={`処置「${a.title}」を削除しますか？元に戻せません。`}
            >
              <button className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                削除
              </button>
            </ConfirmForm>
          </div>
        </div>
      )}
    </li>
  );
}
