import Link from "next/link";
import { Plus, ClipboardList, ListChecks, Boxes, Trash2, FileUp } from "lucide-react";
import { requireAdminPage } from "@/lib/session";
import { listProcedures } from "@/lib/db";
import { deleteProcedureAction } from "@/lib/actions";
import { formatDate } from "@/lib/format";
import type { InspectionProcedure } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import DbErrorState from "@/components/DbErrorState";
import ConfirmForm from "@/components/ConfirmForm";

export const dynamic = "force-dynamic";

export default async function ChecklistsPage() {
  const session = await requireAdminPage();

  let procedures: InspectionProcedure[];
  try {
    procedures = await listProcedures(session.companyId);
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

      {procedures.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {procedures.map((p) => (
            <li key={p.id} className="relative">
              <ConfirmForm
                action={deleteProcedureAction.bind(null, p.id)}
                message="この手順書を削除しますか？割当が解除されます。点検記録がある場合は手順書はアーカイブされ履歴は残ります。"
                className="absolute right-2 top-2 z-10"
              >
                <button
                  className="rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                  aria-label="手順書を削除"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </ConfirmForm>
              <Link
                href={`/checklists/${p.id}`}
                className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 hover:border-orange-300 hover:shadow-sm active:bg-slate-50"
              >
                <div className="flex items-start gap-2 pr-7">
                  <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                  <span className="min-w-0 truncate font-medium text-slate-800">{p.name}</span>
                </div>
                {p.description ? (
                  <p className="mt-1.5 line-clamp-2 text-xs text-slate-500">{p.description}</p>
                ) : (
                  <p className="mt-1.5 text-xs text-slate-300">説明なし</p>
                )}
                <div className="mt-auto pt-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <ListChecks className="h-3.5 w-3.5 text-slate-400" />
                      項目 {p.itemCount ?? 0}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Boxes className="h-3.5 w-3.5 text-slate-400" />
                      割当設備 {p.assignedCount ?? 0}
                    </span>
                  </div>
                  <div className="mt-1.5 text-xs text-slate-400">更新 {formatDate(p.updatedAt)}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
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
