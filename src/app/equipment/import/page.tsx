import { requireAdminPage } from "@/lib/session";
import EquipmentImportClient from "@/components/EquipmentImportClient";

export const dynamic = "force-dynamic";

/** 設備マスタのCSV一括取り込み（マスタ設定＝管理者のみ）。一般ユーザーは "/" にリダイレクト。 */
export default async function EquipmentImportPage() {
  await requireAdminPage();
  return <EquipmentImportClient />;
}
