import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdminPage } from "@/lib/session";
import { listSites } from "@/lib/db";
import { getFactoryScope } from "@/lib/factoryScope";
import PageHeader from "@/components/PageHeader";
import ChecklistImportClient from "@/components/ChecklistImportClient";

export const dynamic = "force-dynamic";

export default async function ChecklistImportPage() {
  const session = await requireAdminPage();
  const [sites, scope] = await Promise.all([
    listSites(session.companyId),
    getFactoryScope(session.companyId, session.userId),
  ]);
  // 取り込み元の点検表は工場ごとの帳票が多いので、所属工場を初期値にする
  const defaultSiteId =
    sites.find((s) => scope.factoryName != null && s.name === scope.factoryName)?.id ?? null;
  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <Link
        href="/checklists"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        手順書一覧に戻る
      </Link>
      <PageHeader
        title="点検表ファイルから取り込み"
        description="既存の点検表（Excel / PDF / CSV）を解析して手順書テンプレートを自動作成します"
      />
      <ChecklistImportClient sites={sites} defaultSiteId={defaultSiteId} />
    </div>
  );
}
