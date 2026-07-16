import { NextResponse } from "next/server";
import { requireEntitledSession } from "@/lib/session";
import { bulkCreateEquipment, listCustomFieldDefs } from "@/lib/db";
import type { EquipmentInput } from "@/lib/db";
import { LEDGER_IMPORT_HEADERS } from "@/lib/ledger";
import type { EquipmentStatus } from "@/lib/types";

const STATUS_MAP: Record<string, EquipmentStatus> = {
  稼働中: "active",
  active: "active",
  休止中: "stopped",
  stopped: "stopped",
  修理中: "repair",
  repair: "repair",
  廃止: "retired",
  retired: "retired",
};

/** 固定列ヘッダ名 → EquipmentInput のフィールド。 */
const FIXED_FIELD_MAP: Record<string, keyof Omit<EquipmentInput, "customValues">> = {
  管理番号: "managementNo",
  設備名: "name",
  カテゴリ: "category",
  メーカー: "maker",
  型式: "modelNo",
  製造番号: "serialNo",
  設置場所: "location",
  状態: "status",
  導入日: "installedDate",
  備考: "notes",
};

function normalizeHeader(h: string): string {
  // 「管理番号*」「 設備名 」等の表記ゆれを吸収
  return h.replace(/[*＊]/g, "").trim();
}

function parseDate(v: string): string | null {
  if (!v) return null;
  // YYYY/MM/DD → YYYY-MM-DD
  const normalized = v.replace(/\//g, "-").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { companyId } = await requireEntitledSession();
    const body = await req.json();
    const rows: string[][] = body.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "データが空です" }, { status: 400 });
    }

    // ヘッダ列（クライアントから受領。無ければ固定列順とみなす）
    const rawHeaders: string[] = Array.isArray(body.headers)
      ? body.headers.map((h: unknown) => normalizeHeader(String(h ?? "")))
      : [...LEDGER_IMPORT_HEADERS];

    // 未知ヘッダはカスタム項目名として突合（一致すれば取り込み、不一致は無視）
    const defs = await listCustomFieldDefs(companyId);
    const defByName = new Map(defs.map((d) => [d.name, d.id]));

    // 列 index → 取り込み先（固定フィールド or カスタム項目defId）
    const columns: Array<
      | { kind: "fixed"; field: keyof Omit<EquipmentInput, "customValues"> }
      | { kind: "custom"; defId: string }
      | { kind: "ignore" }
    > = rawHeaders.map((h) => {
      const field = FIXED_FIELD_MAP[h];
      if (field) return { kind: "fixed", field };
      const defId = defByName.get(h);
      if (defId) return { kind: "custom", defId };
      return { kind: "ignore" };
    });

    const items: EquipmentInput[] = rows.map((cols) => {
      const item: EquipmentInput = { managementNo: "", name: "" };
      const customValues: Record<string, string> = {};
      columns.forEach((col, i) => {
        const raw = (cols[i] ?? "").trim();
        if (col.kind === "custom") {
          if (raw) customValues[col.defId] = raw;
          return;
        }
        if (col.kind !== "fixed") return;
        switch (col.field) {
          case "managementNo":
            item.managementNo = raw;
            break;
          case "name":
            item.name = raw;
            break;
          case "status":
            item.status = STATUS_MAP[raw] ?? "active";
            break;
          case "installedDate":
            item.installedDate = parseDate(raw);
            break;
          case "category":
          case "maker":
          case "modelNo":
          case "serialNo":
          case "location":
          case "notes":
            item[col.field] = raw || null;
            break;
        }
      });
      if (Object.keys(customValues).length > 0) item.customValues = customValues;
      return item;
    });

    const result = await bulkCreateEquipment(companyId, items);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[import]", e);
    return NextResponse.json({ error: "インポートに失敗しました" }, { status: 500 });
  }
}
