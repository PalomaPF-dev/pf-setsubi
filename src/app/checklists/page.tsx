import Link from "next/link";
import { Plus, ClipboardList, ListChecks, Boxes, Trash2, FileUp, Search, Factory } from "lucide-react";
import { requireAdminPage } from "@/lib/session";
import { listProcedures, listSites } from "@/lib/db";
import { deleteProcedureAction } from "@/lib/actions";
import { formatDate } from "@/lib/format";
import type { InspectionProcedure, Site } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import DbErrorState from "@/components/DbErrorState";
import ConfirmForm from "@/components/ConfirmForm";

export const dynamic = "force-dynamic";

const DELETE_MESSAGE =
  "この手順書を削除しますか？割当が解除されます。点検記録がある場合は手順書はアーカイブされ履歴は残ります。";

export default async function ChecklistsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; site?: string }>;
}) {
  const session = await requireAdminPage();
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  // site=shared で共通のみ、site=<工場ID> でその工場のみ。未指定は全工場ぶん。
  const site = sp.site?.trim() || undefined;

  let procedures: InspectionProcedure[];
  let sites: Site[] = [];
  try {
    [procedures, sites] = await Promise.all([
      listProcedures(session.companyId, { search: q, siteFilter: site }),
      listSites(session.companyId),
    ]);
  } catch (e) {
    console.error("[checklists list]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="点検手順書" />
        <DbErrorState />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="点検手順書"
        description="点検項目のテンプレートを作り、設備に割り当てて使います"
        action={
          <div className="flex gap-2">
            <Link
              href="/checklists/import"
              className="inline-flex items-center gap-1.5 rounded-lg border border-orange-300 bg-white px-3 py-2 text-sm font-medium text-orange-700 hover:bg-orange-50"
            >
              <FileUp className="h-4 w-4" />
              Excel/PDF取込
            </Link>
            <Link
              href="/checklists/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-700 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-800"
            >
              <Plus className="h-4 w-4" />
              手順書を作成
            </Link>
          </div>
        }
      />

      {/* 工場での絞り込み（表示制限ではなく分類。どの工場の手順書も割当できる） */}
      {sites.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <SiteTab label="すべての工場" href={hrefWith(q, undefined)} active={!site} />
          <SiteTab label="共通" href={hrefWith(q, "shared")} active={site === "shared"} />
          {sites.map((s) => (
            <SiteTab
              key={s.id}
              label={s.name}
              href={hrefWith(q, s.id)}
              active={site === s.id}
            />
          ))}
        </div>
      )}

      {/* 検索 */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <form>
          {site && <input type="hidden" name="site" value={site} />}
          <div className="relative w-80 max-w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="手順書名・説明・点検項目名で検索"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
        </form>
        {q && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>
              「{q}」の検索結果 {procedures.length} 件
            </span>
            <Link href={hrefWith(undefined, site)} className="text-orange-700 hover:underline">
              クリア
            </Link>
          </div>
        )}
      </div>

      {procedures.length === 0 ? (
        q ? (
          <NoResultState query={q} />
        ) : (
          <EmptyState />
        )
      ) : (
        <>
          {/* PC：一覧表 */}
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white wide:block">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">手順書名</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">作成工場</th>
                  <th className="px-4 py-3 font-medium">説明</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-medium">項目</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-medium">割当設備</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">更新</th>
                  <th className="w-10 px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {procedures.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/checklists/${p.id}`}
                        className="inline-flex items-start gap-2 font-medium text-slate-800 hover:underline"
                      >
                        <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                        {p.name}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <SiteBadge name={p.siteName} />
                    </td>
                    <td className="max-w-md px-4 py-3 text-slate-500">
                      {p.description ? (
                        <span className="line-clamp-2">{p.description}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">
                      {p.itemCount ?? 0}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">
                      {p.assignedCount ?? 0}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                      {formatDate(p.updatedAt)}
                    </td>
                    <td className="px-2 py-3">
                      <ConfirmForm
                        action={deleteProcedureAction.bind(null, p.id)}
                        message={DELETE_MESSAGE}
                      >
                        <button
                          className="rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                          aria-label={`${p.name} を削除`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </ConfirmForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* モバイル：行リスト */}
          <ul className="flex flex-col gap-2.5 wide:hidden">
            {procedures.map((p) => (
              <li key={p.id} className="relative">
                <ConfirmForm
                  action={deleteProcedureAction.bind(null, p.id)}
                  message={DELETE_MESSAGE}
                  className="absolute right-1.5 top-1.5 z-10"
                >
                  <button
                    className="rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                    aria-label={`${p.name} を削除`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </ConfirmForm>
                <Link
                  href={`/checklists/${p.id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-3.5 active:bg-slate-50"
                >
                  <div className="flex items-start gap-2 pr-8">
                    <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                    <span className="min-w-0 font-medium text-slate-800">{p.name}</span>
                  </div>
                  <div className="mt-1.5">
                    <SiteBadge name={p.siteName} />
                  </div>
                  {p.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">{p.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <ListChecks className="h-3.5 w-3.5 text-slate-400" />
                      項目 {p.itemCount ?? 0}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Boxes className="h-3.5 w-3.5 text-slate-400" />
                      割当設備 {p.assignedCount ?? 0}
                    </span>
                    <span className="text-slate-400">更新 {formatDate(p.updatedAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** 検索語と工場フィルタを保ったリンク先を組み立てる。 */
function hrefWith(q: string | undefined, site: string | undefined): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (site) params.set("site", site);
  const qs = params.toString();
  return qs ? `/checklists?${qs}` : "/checklists";
}

function SiteTab({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-orange-700 text-white"
          : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
    </Link>
  );
}

/** 手順書の作成工場バッジ（共通は控えめに表示）。 */
function SiteBadge({ name }: { name: string | null }) {
  if (!name) {
    return (
      <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
        共通
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-600/20">
      <Factory className="h-3 w-3" />
      {name}
    </span>
  );
}

function NoResultState({ query }: { query: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-14 text-center">
      <Search className="mx-auto mb-3 h-9 w-9 text-slate-300" />
      <p className="text-sm text-slate-500">「{query}」に一致する手順書はありません。</p>
      <p className="mt-1 text-xs text-slate-400">
        手順書名・説明・点検項目名を対象に検索しています。
      </p>
      <Link
        href="/checklists"
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
      >
        検索をクリア
      </Link>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
      <ClipboardList className="mx-auto mb-3 h-10 w-10 text-slate-300" />
      <p className="text-sm text-slate-500">まだ点検手順書がありません。</p>
      <p className="mt-1 text-xs text-slate-400">
        「始業前点検」「月次点検」などのテンプレートを作成しましょう。
      </p>
      <Link
        href="/checklists/new"
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-orange-700 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-800"
      >
        <Plus className="h-4 w-4" />
        最初の手順書を作成
      </Link>
    </div>
  );
}
