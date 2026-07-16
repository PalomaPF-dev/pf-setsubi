import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { authOptions } from "@/lib/authOptions";
import { getCompanyEntitlement } from "@/lib/entitlement";
import { getStorage, getUploadMode, isStorageConfigured } from "@/lib/storage";
import {
  MEDIA_MAX_BYTES,
  IMAGE_MAX_BYTES,
  VIDEO_MAX_SECONDS,
  AUDIO_MAX_SECONDS,
  ALLOWED_MEDIA_CONTENT_TYPES,
  extensionForContentType,
} from "@/lib/mediaLimits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 大容量メディア（写真・音声・動画 最大50MB）のアップロード。
 * - GET  : クライアントにアップロード方式と上限を伝える（uploadMedia.ts が1回だけ呼ぶ）
 * - POST : クラウド = @vercel/blob/client の handleUpload プロトコル
 *          （トークン発行のみ。本体はブラウザ→Blob 直接 PUT で 4.5MB 制限を回避）
 *          オンプレ = multipart 直送 → ローカルFS
 * DB への保存は従来どおり Server Action 経由（onUploadCompleted は localhost に届かないため使わない）。
 */

type MediaKindParam = "ref" | "spot" | "result" | "sitemap";
type MediaTypeParam = keyof typeof ALLOWED_MEDIA_CONTENT_TYPES;

async function requireCompany(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const companyId = session?.user?.companyId;
  if (!companyId) return null;
  try {
    const ent = await getCompanyEntitlement(companyId);
    if (!ent.active) return null;
  } catch (e) {
    // 課金チェックの一時失敗で現場作業を止めない（既存方針のフェイルオープン）
    console.error("[entitlement] check failed, allowing:", e);
  }
  return companyId;
}

export async function GET(): Promise<NextResponse> {
  const companyId = await requireCompany();
  if (!companyId) return NextResponse.json({ message: "ログインが必要です" }, { status: 401 });
  return NextResponse.json({
    mode: getUploadMode(),
    companyId,
    limits: {
      maxBytes: MEDIA_MAX_BYTES,
      imageMaxBytes: IMAGE_MAX_BYTES,
      videoMaxSec: VIDEO_MAX_SECONDS,
      audioMaxSec: AUDIO_MAX_SECONDS,
    },
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  const companyId = await requireCompany();
  if (!companyId) return NextResponse.json({ message: "ログインが必要です" }, { status: 401 });
  if (!isStorageConfigured()) {
    return NextResponse.json({ message: "ストレージ未設定です" }, { status: 500 });
  }

  if (getUploadMode() === "client-blob") {
    // ---- クラウド: クライアント直接アップロードのトークン発行 ----
    const body = (await req.json()) as HandleUploadBody;
    try {
      const json = await handleUpload({
        body,
        request: req,
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          // クロステナント書き込みの遮断: パスは必ず自社プレフィックス
          if (!pathname.startsWith(`media/${companyId}/`)) {
            throw new Error("アップロード先が不正です");
          }
          let mediaType: MediaTypeParam = "photo";
          try {
            const p = JSON.parse(clientPayload ?? "{}") as { mediaType?: string };
            if (p.mediaType && p.mediaType in ALLOWED_MEDIA_CONTENT_TYPES) {
              mediaType = p.mediaType as MediaTypeParam;
            }
          } catch {
            /* 既定 photo */
          }
          const isImage = mediaType === "photo" || mediaType === "image";
          return {
            allowedContentTypes: [...ALLOWED_MEDIA_CONTENT_TYPES[mediaType]],
            maximumSizeInBytes: isImage ? IMAGE_MAX_BYTES : MEDIA_MAX_BYTES,
            addRandomSuffix: true,
            validUntil: Date.now() + 10 * 60_000,
          };
        },
        // DB 書き込みは Server Action 経由（このコールバックは localhost に届かない）
        onUploadCompleted: async () => {},
      });
      return NextResponse.json(json);
    } catch (e) {
      return NextResponse.json(
        { message: e instanceof Error ? e.message : "アップロードに失敗しました" },
        { status: 400 }
      );
    }
  }

  // ---- オンプレ(local): multipart 直送 ----
  // req.formData() はボディ全体をメモリにバッファリングしてからパースするため、
  // サイズ超過の判定より前に大容量ボディを読み切ってしまう（OOM の恐れ）。
  // この時点では mediaType 未確定なので、multipart のオーバーヘッド分を見込んだ
  // 上限（動画・音声の上限 + 1MB）で Content-Length を先にガードする。
  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > 0 && declaredLength > MEDIA_MAX_BYTES + 1024 * 1024) {
    return NextResponse.json(
      { message: `ファイルが大きすぎます（上限 ${Math.round(MEDIA_MAX_BYTES / 1024 / 1024)}MB）` },
      { status: 413 }
    );
  }
  const fd = await req.formData();
  const file = fd.get("file");
  const kind = String(fd.get("kind") ?? "result").replace(/[^\w-]/g, "") as MediaKindParam;
  const mediaTypeRaw = String(fd.get("mediaType") ?? "photo");
  const mediaType = (
    mediaTypeRaw in ALLOWED_MEDIA_CONTENT_TYPES ? mediaTypeRaw : "photo"
  ) as MediaTypeParam;
  const scopeId = String(fd.get("scopeId") ?? "adhoc").replace(/[^\w-]/g, "");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ message: "ファイルがありません" }, { status: 400 });
  }
  const isImage = mediaType === "photo" || mediaType === "image";
  const maxBytes = isImage ? IMAGE_MAX_BYTES : MEDIA_MAX_BYTES;
  if (file.size > maxBytes) {
    return NextResponse.json(
      { message: `ファイルが大きすぎます（上限 ${Math.round(maxBytes / 1024 / 1024)}MB）` },
      { status: 413 }
    );
  }
  const baseType = (file.type || "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_MEDIA_CONTENT_TYPES[mediaType].includes(baseType)) {
    return NextResponse.json({ message: "このファイル形式は登録できません" }, { status: 400 });
  }

  const ext = extensionForContentType(baseType);
  const rand = crypto.randomUUID().slice(0, 8);
  const saved = await getStorage().saveFile({
    companyId,
    key: `media/${kind}/${scopeId}/${Date.now()}_${rand}.${ext}`,
    file,
    contentType: baseType,
  });
  return NextResponse.json({ url: saved.url });
}
