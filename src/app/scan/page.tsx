import Link from "next/link";
import { QrCode, CalendarClock, PlayCircle, Database } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getFactoryScope, scopedSiteId } from "@/lib/factoryScope";
import { listAssignmentsDue } from "@/lib/db";
import { dueLevel, daysUntil, todayJST } from "@/lib/inspection";
import { formatDate } from "@/lib/format";
import { DueBadge } from "@/components/Badges";
import ManualLookup from "@/components/ManualLookup";
import QrScanner from "@/components/QrScanner";
import type { EquipmentProcedure } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const session = await requireEntitledSession();
  const today = todayJST();

  // 期限が近い点検（スキャナ自体は DB なしでも動かしたいので、失敗はリスト部分のみのエラー表示にする）
  let due: EquipmentProcedure[] | null = null;
  try {
    // 所属工場による表示制限（制限ユーザーは自工場の点検のみ）
    const scope = await getFactoryScope(session.companyId, session.userId);
    due = (
      await listAssignmentsDue(session.companyId, { siteId: scopedSiteId(scope) })
    ).slice(0, 10);
  } catch (e) {
    console.error("[scan] due list", e);
    due = null;
  }

  return (
    <div className="mx-auto max-w-md p-4 sm:p-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-bold text-slate-800">
        <QrCode className="h-6 w-6 text-orange-700" />
        点検・スキャン
      </h1>
      <p className="mb-5 text-sm text-slate-500">設備のQRコードを読み取って、台帳・点検画面を開きます。</p>

      <QrScanner />

      {/* 手入力（QRが読めない・カメラが使えないとき） */}
      <div className="mt-6">
        <div className="mb-3 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          または 管理番号で開く
          <span className="h-px flex-1 bg-slate-200" />
        </div>
        <ManualLookup placeholder="例: S-0001" />
        <p className="mt-1.5 text-xs text-slate-400">
          完全一致でその設備を表示します。部分一致や設備名は台帳の検索結果に移動します。
        </p>
      </div>

      {/* 期限が近い点検 */}
      <div className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
          <CalendarClock className="h-4 w-4 text-orange-700" />
          期限が近い点検
        </h2>
        {due === null ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
            <Database className="mx-auto mb-1.5 h-5 w-5 text-amber-500" />
            <p className="text-sm text-amber-700">
              点検一覧を取得できませんでした。データベース接続を確認してください。
            </p>
          </div>
        ) : due.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-500">
            点検の割当がありません。設備詳細から手順書を割り当てると、ここに表示されます。
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {due.map((a) => {
              const level = dueLevel(a.nextDueDate, today);
              const days = a.nextDueDate ? daysUntil(a.nextDueDate, today) : null;
              return (
                <li key={a.id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-800">
                      {a.equipmentName}
                      {a.managementNo && (
                        <span className="ml-1.5 text-xs font-normal text-slate-400">
                          {a.managementNo}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <span className="truncate">{a.procedureName}</span>
                      <span>{a.nextDueDate ? formatDate(a.nextDueDate) : "都度"}</span>
                      <DueBadge level={level} days={days} />
                    </div>
                  </div>
                  <Link
                    href={`/inspect/${a.id}`}
                    className="inline-flex h-11 shrink-0 items-center gap-1 rounded-lg bg-orange-700 px-3 text-sm font-semibold text-white hover:bg-orange-800"
                  >
                    <PlayCircle className="h-4 w-4" />
                    点検開始
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
