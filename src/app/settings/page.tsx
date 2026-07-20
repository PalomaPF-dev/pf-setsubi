import { ChevronUp, ChevronDown, Trash2, Factory, Plus, MapPinned, ShieldCheck } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getUserRoleAndFactory } from "@/lib/authDb";
import {
  getManagementNoSettings,
  getApprovalSettings,
  listCustomFieldDefs,
  listSitesWithAreas,
} from "@/lib/db";
import {
  updateManagementNoSettingsAction,
  updateApprovalSettingsAction,
  createCustomFieldDefAction,
  deleteCustomFieldDefAction,
  moveCustomFieldDefAction,
  createSiteAction,
  updateSiteAction,
  moveSiteAction,
  deleteSiteAction,
  createAreaAction,
  updateAreaAction,
  moveAreaAction,
  deleteAreaAction,
} from "@/lib/actions";
import { CUSTOM_FIELD_TYPE_LABEL } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import ConfirmForm from "@/components/ConfirmForm";
import CustomFieldDefForm from "@/components/CustomFieldDefForm";
import FactoryMapUploadForm from "@/components/FactoryMapUploadForm";
import DbErrorState from "@/components/DbErrorState";
import DeleteAccountSection from "@/components/DeleteAccountSection";
import WorkerManagement from "@/components/WorkerManagement";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { companyId, userId, isDemo } = await requireEntitledSession();

  let s, approval, defs, sites, rf;
  try {
    [s, approval, defs, sites, rf] = await Promise.all([
      getManagementNoSettings(companyId),
      getApprovalSettings(companyId),
      listCustomFieldDefs(companyId),
      listSitesWithAreas(companyId),
      getUserRoleAndFactory(userId),
    ]);
  } catch (e) {
    console.error("[settings]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="設定" />
        <DbErrorState />
      </div>
    );
  }

  const preview = `${s.prefix}-${String(s.seq).padStart(s.digits, "0")}`;
  // マスタ設定（採番・承認・カスタム項目・工場/職場）は管理者のみ編集可
  const isAdmin = (rf?.role ?? "admin") === "admin";
  // 所属工場による表示制限ユーザーには、工場・職場の一覧も自工場のみ見せる
  const restrictedFactory = rf && rf.role !== "admin" ? rf.factory : null;
  if (restrictedFactory) {
    sites = sites.filter((site) => site.name === restrictedFactory);
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <PageHeader
        title="設定"
        description="採番ルール・承認ワークフロー・カスタム項目・工場/職場を設定します"
      />

      <div className="flex flex-col gap-6">
        {/* 作業者管理（アカウント管理はポータル。ログイン中なら誰でも操作可） */}
        <WorkerManagement />

        {/* 以下のマスタ設定（採番・承認・カスタム項目・工場/職場）は管理者のみ */}
        {isAdmin && (
          <>
        {/* 採番ルール */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-bold text-slate-700">管理番号 採番ルール</h2>
          <p className="mb-4 text-xs text-slate-400">
            新規登録時に「自動採番」ボタンを押すと、下記ルールで管理番号を発番します。
          </p>

          <div className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            次に採番される番号: <span className="font-mono font-bold">{preview}</span>
          </div>

          <form action={updateManagementNoSettingsAction} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">
                  プレフィックス
                </label>
                <input
                  name="prefix"
                  defaultValue={s.prefix}
                  maxLength={8}
                  placeholder="S"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <p className="mt-1 text-xs text-slate-400">番号の先頭文字（例: S, EQ, NO）</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">
                  桁数
                </label>
                <input
                  name="digits"
                  type="number"
                  min={1}
                  max={8}
                  defaultValue={s.digits}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <p className="mt-1 text-xs text-slate-400">ゼロ埋めの桁数（例: 4→0001）</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">
                  次の連番
                </label>
                <input
                  name="seq"
                  type="number"
                  min={1}
                  defaultValue={s.seq}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <p className="mt-1 text-xs text-slate-400">次に採番する番号（既存と重複しないよう設定）</p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              <span className="font-medium text-slate-600">採番例: </span>
              プレフィックス「S」・桁数「4」→ S-0001, S-0002 …
              / プレフィックス「EQ」・桁数「3」→ EQ-001, EQ-002 …
            </div>

            <div>
              <SubmitButton pendingText="保存中…">設定を保存</SubmitButton>
            </div>
          </form>
        </div>

        {/* 承認ワークフロー */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-slate-700">
            <ShieldCheck className="h-4 w-4 text-orange-500" />
            承認ワークフロー
          </h2>
          <p className="mb-4 text-xs text-slate-400">
            点検が実施されると「承認待ち」になり、承認者へメールで結果が届きます。承認すると点検完了、差し戻すと
            再点検対象に戻ります。
          </p>

          <form action={updateApprovalSettingsAction} className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">承認者メール</label>
              <input
                name="approverEmail"
                type="text"
                defaultValue={approval.approverEmail ?? ""}
                placeholder="例: kanri@example.com（複数はカンマ区切り）"
                className={inputCls}
              />
              <p className="mt-1 text-xs text-slate-400">
                点検完了時に承認依頼メールを送る宛先。空欄の場合は社内の全ユーザーに送信します。
              </p>
            </div>

            <div>
              <SubmitButton pendingText="保存中…">承認設定を保存</SubmitButton>
            </div>
          </form>
        </div>

        {/* カスタム項目管理 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-bold text-slate-700">台帳のカスタム項目</h2>
          <p className="mb-4 text-xs text-slate-400">
            設備台帳に自社独自の項目（例: 資産番号・保守契約先・耐用年数）を追加できます。
            登録/編集フォーム・詳細画面・CSV/PDF出力に反映されます。
          </p>

          {defs.length === 0 ? (
            <p className="mb-4 rounded-xl border border-dashed border-slate-300 py-6 text-center text-sm text-slate-400">
              カスタム項目はまだありません。
            </p>
          ) : (
            <ul className="mb-4 divide-y divide-slate-100">
              {defs.map((d, i) => (
                <li key={d.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex flex-col">
                    <form action={moveCustomFieldDefAction.bind(null, d.id, "up")}>
                      <button
                        disabled={i === 0}
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
                        aria-label="上へ移動"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                    </form>
                    <form action={moveCustomFieldDefAction.bind(null, d.id, "down")}>
                      <button
                        disabled={i === defs.length - 1}
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
                        aria-label="下へ移動"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-slate-800">{d.name}</span>
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                        {CUSTOM_FIELD_TYPE_LABEL[d.fieldType]}
                      </span>
                    </div>
                    {d.fieldType === "select" && d.options && d.options.length > 0 && (
                      <div className="truncate text-xs text-slate-400">{d.options.join(" / ")}</div>
                    )}
                  </div>
                  <ConfirmForm
                    action={deleteCustomFieldDefAction.bind(null, d.id)}
                    message={`カスタム項目「${d.name}」を削除しますか？既存設備に入力済みの値は表示されなくなります。`}
                  >
                    <button className="rounded p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500" aria-label="削除">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </ConfirmForm>
                </li>
              ))}
            </ul>
          )}

          <CustomFieldDefForm action={createCustomFieldDefAction} />
        </div>

        {/* 工場・職場 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-bold text-slate-700">工場・職場</h2>
          <p className="mb-4 text-xs text-slate-400">
            工場（拠点）とその配下の職場（ライン・エリア）を登録すると、台帳・ダッシュボード・点検予定を
            工場/職場で絞り込めます。マップ画像を登録すると、設備をマップ上にピンで配置できます。
          </p>

          {sites.length === 0 ? (
            <p className="mb-4 rounded-xl border border-dashed border-slate-300 py-6 text-center text-sm text-slate-400">
              工場はまだ登録されていません。
            </p>
          ) : (
            <ul className="mb-4 flex flex-col gap-2">
              {sites.map((site, i) => {
                const areas = site.areas ?? [];
                return (
                  <li key={site.id} className="flex items-start gap-2">
                    <div className="flex flex-col pt-2.5">
                      <form action={moveSiteAction.bind(null, site.id, "up")}>
                        <button
                          disabled={i === 0}
                          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
                          aria-label="上へ移動"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                      </form>
                      <form action={moveSiteAction.bind(null, site.id, "down")}>
                        <button
                          disabled={i === sites.length - 1}
                          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
                          aria-label="下へ移動"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </form>
                    </div>

                    <details className="min-w-0 flex-1 rounded-xl bg-slate-50">
                      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2.5">
                        <Factory className="h-4 w-4 shrink-0 text-orange-500" />
                        <span className="truncate text-sm font-medium text-slate-800">{site.name}</span>
                        <span className="shrink-0 rounded bg-slate-200/70 px-1.5 py-0.5 text-xs text-slate-500">
                          職場 {areas.length}
                        </span>
                        {site.mapImageUrl && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-orange-50 px-1.5 py-0.5 text-xs text-orange-700">
                            <MapPinned className="h-3 w-3" />
                            マップ設定済み
                          </span>
                        )}
                      </summary>

                      <div className="flex flex-col gap-5 border-t border-slate-200 p-3">
                        {/* 名称変更 */}
                        <form action={updateSiteAction.bind(null, site.id)} className="flex items-end gap-2">
                          <div className="min-w-0 flex-1">
                            <label className="mb-1.5 block text-xs font-medium text-slate-500">工場名</label>
                            <input name="name" required defaultValue={site.name} className={inputCls} />
                          </div>
                          <SubmitButton pendingText="保存中…" className="h-[38px] shrink-0 !px-3 !py-0 text-xs">
                            名称を変更
                          </SubmitButton>
                        </form>

                        {/* マップ画像 */}
                        <FactoryMapUploadForm siteId={site.id} mapUrl={site.mapImageUrl} />

                        {/* 職場リスト */}
                        <div>
                          <div className="mb-1.5 text-xs font-medium text-slate-500">職場（ライン・エリア）</div>
                          {areas.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-slate-300 bg-white py-3 text-center text-xs text-slate-400">
                              職場はまだありません。
                            </p>
                          ) : (
                            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                              {areas.map((a, j) => (
                                <li key={a.id} className="flex items-start gap-2 px-3 py-2">
                                  <div className="flex flex-col">
                                    <form action={moveAreaAction.bind(null, a.id, site.id, "up")}>
                                      <button
                                        disabled={j === 0}
                                        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
                                        aria-label="上へ移動"
                                      >
                                        <ChevronUp className="h-3.5 w-3.5" />
                                      </button>
                                    </form>
                                    <form action={moveAreaAction.bind(null, a.id, site.id, "down")}>
                                      <button
                                        disabled={j === areas.length - 1}
                                        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
                                        aria-label="下へ移動"
                                      >
                                        <ChevronDown className="h-3.5 w-3.5" />
                                      </button>
                                    </form>
                                  </div>
                                  <details className="min-w-0 flex-1 pt-1">
                                    <summary className="cursor-pointer truncate text-sm text-slate-700 hover:text-orange-700">
                                      {a.name}
                                    </summary>
                                    <form
                                      action={updateAreaAction.bind(null, a.id)}
                                      className="mt-2 flex items-center gap-2"
                                    >
                                      <input name="name" required defaultValue={a.name} className={inputCls} />
                                      <SubmitButton pendingText="保存中…" className="shrink-0 !px-3 !py-1.5 text-xs">
                                        名称を変更
                                      </SubmitButton>
                                    </form>
                                  </details>
                                  <ConfirmForm
                                    action={deleteAreaAction.bind(null, a.id)}
                                    message={`職場「${a.name}」を削除しますか？この職場を設定していた設備の職場は未設定になります（設備自体は削除されません）。`}
                                  >
                                    <button
                                      className="rounded p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                                      aria-label="削除"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </ConfirmForm>
                                </li>
                              ))}
                            </ul>
                          )}

                          {/* 職場追加 */}
                          <form action={createAreaAction} className="mt-2 flex items-center gap-2">
                            <input type="hidden" name="siteId" value={site.id} />
                            <input name="name" required placeholder="例: 第1ライン・組立エリア" className={inputCls} />
                            <SubmitButton pendingText="追加中…" className="shrink-0 !px-3 !py-1.5 text-xs">
                              <span className="inline-flex items-center gap-1">
                                <Plus className="h-3.5 w-3.5" />
                                職場を追加
                              </span>
                            </SubmitButton>
                          </form>
                        </div>
                      </div>
                    </details>

                    <ConfirmForm
                      action={deleteSiteAction.bind(null, site.id)}
                      message={`工場「${site.name}」を削除しますか？配下の職場が削除され、設備の工場設定と配置ピンも解除されます（設備自体は削除されません）。`}
                      className="pt-1.5"
                    >
                      <button
                        className="rounded p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                        aria-label="削除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </ConfirmForm>
                  </li>
                );
              })}
            </ul>
          )}

          {/* 工場追加 */}
          <form action={createSiteAction} className="flex items-center gap-2">
            <input name="name" required placeholder="例: 本社工場・第2工場" className={`${inputCls} max-w-xs`} />
            <SubmitButton pendingText="追加中…" className="shrink-0">
              <span className="inline-flex items-center gap-1">
                <Plus className="h-4 w-4" />
                工場を追加
              </span>
            </SubmitButton>
          </form>
        </div>

          </>
        )}

        {/* 危険な操作（アカウント削除＝退会）。デモでは出さない */}
        {!isDemo && <DeleteAccountSection />}
      </div>
    </div>
  );
}
