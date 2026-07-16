import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getFactoryScope, isEquipmentSiteVisible } from "@/lib/factoryScope";
import {
  getAssignment,
  getEquipment,
  getProcedure,
  getApprovalSettings,
  listInspectionItems,
  listReferenceMediaForProcedure,
} from "@/lib/db";
import type {
  Equipment,
  EquipmentProcedure,
  InspectionItem,
  InspectionProcedure,
  ItemReferenceMedia,
} from "@/lib/types";
import DbErrorState from "@/components/DbErrorState";
import InspectionWizard from "@/components/InspectionWizard";

export const dynamic = "force-dynamic";

/**
 * 点検実施ウィザードの入口。割当（設備×手順書）を読み込んで
 * クライアントの InspectionWizard に渡す。点検に集中できるようシンプルに保つ。
 */
export default async function InspectPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const session = await requireEntitledSession();
  const { assignmentId } = await params;

  let assignment: EquipmentProcedure | null = null;
  let equipment: Equipment | null = null;
  let procedure: InspectionProcedure | null = null;
  let items: InspectionItem[] = [];
  let workerRoster: string[] = [];
  // 正常見本メディア（Map は Client Component へ渡せないので Object に変換して渡す）
  let referenceMedia: Record<string, ItemReferenceMedia[]> = {};
  try {
    assignment = await getAssignment(session.companyId, assignmentId);
    if (assignment) {
      let refMap: Map<string, ItemReferenceMedia[]>;
      let approval;
      let scope;
      [equipment, procedure, items, refMap, approval, scope] = await Promise.all([
        getEquipment(session.companyId, assignment.equipmentId),
        getProcedure(session.companyId, assignment.procedureId),
        listInspectionItems(session.companyId, assignment.procedureId),
        listReferenceMediaForProcedure(session.companyId, assignment.procedureId),
        getApprovalSettings(session.companyId),
        getFactoryScope(session.companyId, session.userId),
      ]);
      // 所属工場による表示制限（他工場の設備の点検は開始できない＝notFound）
      if (!isEquipmentSiteVisible(scope, equipment?.siteId ?? null)) {
        assignment = null;
      }
      referenceMedia = Object.fromEntries(refMap);
      workerRoster = approval.workerRoster;
    }
  } catch (e) {
    console.error("[inspect]", e);
    return (
      <div className="p-4 sm:p-6">
        <DbErrorState />
      </div>
    );
  }

  if (!assignment) notFound();

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-md p-4 sm:p-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
            <ClipboardList className="h-6 w-6" />
          </div>
          <h1 className="text-base font-bold text-amber-800">点検項目がありません</h1>
          <p className="mt-2 text-sm text-amber-700">
            手順書「{assignment.procedureName ?? "—"}」に点検項目が登録されていません。
            <br />
            手順書に項目を追加してください。
          </p>
          <Link
            href={`/checklists/${assignment.procedureId}`}
            className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-orange-700 px-4 text-sm font-semibold text-white hover:bg-orange-800"
          >
            手順書を開く
          </Link>
        </div>
      </div>
    );
  }

  return (
    <InspectionWizard
      assignment={assignment}
      equipmentName={equipment?.name ?? assignment.equipmentName ?? ""}
      managementNo={equipment?.managementNo ?? assignment.managementNo ?? ""}
      items={items}
      referenceMedia={referenceMedia}
      diagramUrl={procedure?.diagramUrl ?? null}
      workerRoster={workerRoster}
      userName={session.userName}
    />
  );
}
