import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdminPage } from "@/lib/session";
import { listSites } from "@/lib/db";
import { getFactoryScope } from "@/lib/factoryScope";
import PageHeader from "@/components/PageHeader";
import NewChecklistTabs from "@/components/NewChecklistTabs";

export const dynamic = "force-dynamic";

export default async function NewChecklistPage() {
  const session = await requireAdminPage();
  const [sites, scope] = await Promise.all([
    listSites(session.companyId),
    getFactoryScope(session.companyId, session.userId),
  ]);
  // 所属工場があればそれを初期値にする（工場ごとに手順書を作るのが通常運用）。
  // 所属未設定・工場マスタに名前が無い場合は共通を初期値にする。
  const defaultSiteId =
    sites.find((s) => scope.factoryName != null && s.name === scope.factoryName)?.id ?? null;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <Link
        href="/checklists"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        手順書一覧に戻る
      </Link>
      <PageHeader
        title="手順書を作成"
        description="白紙から作るか、標準テンプレートから作成できます（作成後に項目を自由に編集できます）"
      />
      <NewChecklistTabs sites={sites} defaultSiteId={defaultSiteId} />
    </div>
  );
}
