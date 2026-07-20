import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdminPage } from "@/lib/session";
import { getFactoryScope, isEquipmentSiteVisible } from "@/lib/factoryScope";
import { getEquipment, listCustomFieldDefs, listSitesWithAreas } from "@/lib/db";
import { updateEquipmentAction } from "@/lib/actions";
import PageHeader from "@/components/PageHeader";
import EquipmentForm from "@/components/EquipmentForm";
import DbErrorState from "@/components/DbErrorState";

export const dynamic = "force-dynamic";

export default async function EditEquipmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdminPage();
  const { id } = await params;

  let equipment, defs, sites;
  try {
    const scope = await getFactoryScope(session.companyId, session.userId);
    [equipment, defs, sites] = await Promise.all([
      getEquipment(session.companyId, id),
      listCustomFieldDefs(session.companyId),
      listSitesWithAreas(session.companyId),
    ]);
    // 所属工場による表示制限（他工場の設備は notFound。工場の選択肢も自工場のみ）
    if (equipment && !isEquipmentSiteVisible(scope, equipment.siteId)) equipment = null;
    if (scope.restricted) sites = sites.filter((s) => s.id === scope.siteId);
  } catch (e) {
    console.error("[equipment edit]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="設備を編集" />
        <DbErrorState />
      </div>
    );
  }
  if (!equipment) notFound();

  // id をバインドした更新アクション
  const action = updateEquipmentAction.bind(null, id);

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <Link href={`/equipment/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        詳細に戻る
      </Link>
      <PageHeader title="設備を編集" description={equipment.name} />
      <EquipmentForm action={action} initial={equipment} submitLabel="変更を保存" defs={defs} sites={sites} />
    </div>
  );
}
