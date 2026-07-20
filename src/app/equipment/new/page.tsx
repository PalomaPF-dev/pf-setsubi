import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdminPage } from "@/lib/session";
import { getFactoryScope } from "@/lib/factoryScope";
import { listCustomFieldDefs, listSitesWithAreas } from "@/lib/db";
import { createEquipmentAction } from "@/lib/actions";
import { todayJST } from "@/lib/inspection";
import PageHeader from "@/components/PageHeader";
import EquipmentForm from "@/components/EquipmentForm";
import DbErrorState from "@/components/DbErrorState";

export const dynamic = "force-dynamic";

export default async function NewEquipmentPage() {
  const session = await requireAdminPage();

  let defs, sites;
  try {
    const scope = await getFactoryScope(session.companyId, session.userId);
    [defs, sites] = await Promise.all([
      listCustomFieldDefs(session.companyId),
      listSitesWithAreas(session.companyId),
    ]);
    // 制限ユーザーには工場の選択肢を自工場のみにする
    if (scope.restricted) sites = sites.filter((s) => s.id === scope.siteId);
  } catch (e) {
    console.error("[equipment new]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="設備を登録" />
        <DbErrorState />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <Link href="/equipment" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        台帳に戻る
      </Link>
      <PageHeader title="設備を登録" description="新しい設備を台帳に追加します" />
      <EquipmentForm action={createEquipmentAction} submitLabel="登録する" today={todayJST()} defs={defs} sites={sites} />
    </div>
  );
}
