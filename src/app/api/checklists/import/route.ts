import { NextResponse } from "next/server";
import { requireEntitledSession } from "@/lib/session";
import { getUserRoleAndFactory } from "@/lib/authDb";
import { parseImportFile, IMPORT_LIMITS, type ProcedureDraft } from "@/lib/importParse";

export const runtime = "nodejs";

// 点検表ファイル（Excel/PDF/CSV）を解析して手順書ドラフトを返す。
// DB への登録はプレビュー確認後に importProceduresAction（Server Action）で行う。
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { userId } = await requireEntitledSession();
    // 手順書の一括取り込みは管理者のみ
    const rf = await getUserRoleAndFactory(userId);
    if ((rf?.role ?? "admin") !== "admin") {
      return NextResponse.json({ error: "この操作は管理者のみ実行できます" }, { status: 403 });
    }

    const fd = await req.formData();
    const files = fd.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "ファイルが選択されていません" }, { status: 400 });
    }
    if (files.length > IMPORT_LIMITS.maxFiles) {
      return NextResponse.json(
        { error: `一度に取り込めるのは ${IMPORT_LIMITS.maxFiles} ファイルまでです` },
        { status: 400 }
      );
    }

    const drafts: ProcedureDraft[] = [];
    const errors: { file: string; reason: string }[] = [];
    for (const file of files) {
      if (file.size > IMPORT_LIMITS.maxFileBytes) {
        errors.push({
          file: file.name,
          reason: `ファイルサイズが上限（${Math.floor(IMPORT_LIMITS.maxFileBytes / 1024 / 1024)}MB）を超えています`,
        });
        continue;
      }
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const parsed = await parseImportFile(file.name, buffer);
        if (parsed.length === 0) {
          errors.push({ file: file.name, reason: "点検項目を検出できませんでした" });
        } else {
          drafts.push(...parsed);
        }
      } catch (e) {
        console.error("[checklists import parse]", file.name, e);
        errors.push({
          file: file.name,
          reason: e instanceof Error ? e.message : "ファイルの解析に失敗しました",
        });
      }
    }

    return NextResponse.json({ drafts, errors });
  } catch (e) {
    console.error("[checklists import]", e);
    return NextResponse.json({ error: "取り込み処理に失敗しました" }, { status: 500 });
  }
}
