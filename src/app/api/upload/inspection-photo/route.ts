import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getStorage, isStorageConfigured } from "@/lib/storage";
import { authOptions } from "@/lib/authOptions";
import { getCompanyEntitlement } from "@/lib/entitlement";

export const dynamic = "force-dynamic";

/**
 * 点検ウィザードの写真アップロード（項目ごとに撮影直後へ逐次送信）。
 * Server Action ではなく Route Handler にしているのは、Action のボディ上限
 * （bodySizeLimit）に依存せず、リクエスト上限（Vercel 4.5MB）まで受けるため。
 * クライアント側で長辺 1600px に圧縮済みの JPEG が前提。
 */
export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const companyId = session?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ message: "ログインが必要です" }, { status: 401 });
  }
  try {
    const ent = await getCompanyEntitlement(companyId);
    if (!ent.active) {
      return NextResponse.json({ message: "契約が必要です" }, { status: 403 });
    }
  } catch (e) {
    // 課金チェックの一時失敗で点検を止めない（フェイルオープン、session.ts と同方針）
    console.error("[entitlement] check failed, allowing:", e);
  }
  if (!isStorageConfigured()) {
    return NextResponse.json(
      { message: "ストレージ未設定です（BLOB_READ_WRITE_TOKEN または STORAGE_DRIVER=local）" },
      { status: 500 }
    );
  }

  const fd = await req.formData();
  const file = fd.get("file");
  const draftKey = String(fd.get("draftKey") ?? "").replace(/[^\w-]/g, "");
  const itemId = String(fd.get("itemId") ?? "").replace(/[^\w-]/g, "");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ message: "ファイルがありません" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ message: "画像ファイルを指定してください" }, { status: 400 });
  }

  // key は必ず media/<companyId>/ 配下にする。保存後の URL は完了時（Server Action）に
  // isOwnMediaUrl で検証されるため、プレフィックスが一致しないと点検を完了できない。
  const saved = await getStorage().saveFile({
    companyId,
    key: `media/${companyId}/inspection/${draftKey || "adhoc"}/${itemId || "item"}_${Date.now()}.jpg`,
    file,
    contentType: "image/jpeg",
  });
  return NextResponse.json({ url: saved.url });
}
