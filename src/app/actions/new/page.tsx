import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Wrench } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getUserRoleAndFactory } from "@/lib/authDb";
import { getFactoryScope, isEquipmentSiteVisible, scopedSiteId } from "@/lib/factoryScope";
import { getEquipment, getItemResultContext, listEquipment, listWorkers } from "@/lib/db";
import { createCorrectiveActionAction } from "@/lib/actions";
import { formatDate } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import DbErrorState from "@/components/DbErrorState";
import WorkerSelectField from "@/components/WorkerSelectField";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

function asUuid(v: string | undefined): string | undefined {
  return v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    ? v
    : undefined;
}

export default async function NewActionPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string; equipment?: string }>;
}) {
  const session = await requireEntitledSession();
  const sp = await searchParams;
  const itemResultId = asUuid(sp.item);
  const presetEquipmentId = asUuid(sp.equipment);

  let ctx = null;
  let equipment;
  let outOfScope = false;
  let workerNames: string[] = [];
  let isWorker = false;
  try {
    // 所属工場による表示制限（制限ユーザーは自工場の設備のみ起票対象）
    const scope = await getFactoryScope(session.companyId, session.userId);
    workerNames = (await listWorkers(session.companyId)).map((w) => w.name);
    // role='worker' は担当者を本人で固定（サーバー側でも強制）
    isWorker = (await getUserRoleAndFactory(session.userId))?.role === "worker";
    if (itemResultId) {
      ctx = await getItemResultContext(session.companyId, itemResultId);
      if (ctx && scope.restricted) {
        const eq = await getEquipment(session.companyId, ctx.equipmentId);
        if (!isEquipmentSiteVisible(scope, eq?.siteId ?? null)) outOfScope = true;
      }
    }
    if (!ctx) {
      equipment = await listEquipment(session.companyId, undefined, {
        siteId: scopedSiteId(scope),
      });
    }
  } catch (e) {
    console.error("[actions/new]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="処置を登録" />
        <DbErrorState />
      </div>
    );
  }
  if (outOfScope) notFound();

  return (
    <div className="mx-auto max-w-lg p-4 sm:p-6">
      <Link
        href="/actions"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        処置管理に戻る
      </Link>
      <PageHeader
        title="処置を登録"
        description="是正対応のタイトル・担当・期限を決めて登録します"
      />

      {ctx && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <Wrench className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            起票元: <strong>{ctx.equipmentName}</strong>（{ctx.managementNo}） /
            「{ctx.itemLabel}」（{formatDate(ctx.inspectionDate)} の点検）
          </div>
        </div>
      )}

      <form
        action={createCorrectiveActionAction}
        className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
      >
        {ctx ? (
          <input type="hidden" name="itemResultId" value={ctx.itemResultId} />
        ) : (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">対象設備（必須）</span>
            <select name="equipmentId" required defaultValue={presetEquipmentId ?? ""} className={inputCls}>
              <option value="" disabled>
                設備を選択してください
              </option>
              {(equipment ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}（{e.managementNo}）
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">タイトル（必須）</span>
          <input
            name="title"
            required
            defaultValue={ctx ? `${ctx.itemLabel} の是正` : ""}
            placeholder="例: ベルトの張り調整と交換部品の手配"
            className={inputCls}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">内容・対応方針</span>
          <textarea
            name="detail"
            rows={4}
            defaultValue={ctx?.valueText ? `点検時コメント: ${ctx.valueText}` : ""}
            placeholder="現象・原因の見立て・対応方針など"
            className={inputCls}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">担当者</span>
            <WorkerSelectField
              name="assignee"
              workers={workerNames}
              placeholder="例: 保全 山田"
              className={inputCls}
              fixedValue={isWorker ? session.userName : null}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">対応期限</span>
            <input type="date" name="dueDate" className={inputCls} />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <SubmitButton pendingText="登録中…">処置を登録</SubmitButton>
          <Link href="/actions" className="text-sm text-slate-500 hover:text-slate-700">
            キャンセル
          </Link>
        </div>
      </form>
    </div>
  );
}
