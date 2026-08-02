"use client";

import { MEDIA_MAX_BYTES, IMAGE_MAX_BYTES, extensionForContentType } from "./mediaLimits";

/**
 * メディア（写真・音声・動画）アップロードのクライアント統一API。
 * ドライバ（クラウド=Blob直接 / オンプレ=multipart）はサーバーに1回だけ問い合わせて
 * モジュール内にキャッシュする（実行時固定のため）。
 */

// 社内共通の統一 Blob Store を他アプリと共有するための区画分け。
// storage.ts の APP_PREFIX と必ず一致させること（サーバー側 onBeforeGenerateToken の検証と対）。
const APP_PREFIX = "setsubi";

export type MediaKind = "ref" | "spot" | "result" | "sitemap" | "diagram";
export type UploadMediaType = "photo" | "audio" | "video" | "image";

interface UploadInfo {
  mode: "client-blob" | "server-multipart";
  companyId: string;
}

let infoPromise: Promise<UploadInfo> | null = null;

function getUploadInfo(): Promise<UploadInfo> {
  if (!infoPromise) {
    infoPromise = fetch("/api/upload/media", { method: "GET" })
      .then(async (res) => {
        if (!res.ok) throw new Error("アップロード設定の取得に失敗しました");
        return (await res.json()) as UploadInfo;
      })
      .catch((e) => {
        infoPromise = null; // 次回リトライできるように
        throw e;
      });
  }
  return infoPromise;
}

export async function uploadMedia(
  file: File | Blob,
  opts: {
    kind: MediaKind;
    mediaType: UploadMediaType;
    scopeId: string; // itemId / siteId / draftKey など（パスに使う）
    fileName?: string;
    onProgress?: (percent: number) => void;
  }
): Promise<{ url: string }> {
  const isImage = opts.mediaType === "photo" || opts.mediaType === "image";
  const maxBytes = isImage ? IMAGE_MAX_BYTES : MEDIA_MAX_BYTES;
  if (file.size > maxBytes) {
    throw new Error(`ファイルが大きすぎます（上限 ${Math.round(maxBytes / 1024 / 1024)}MB）`);
  }

  const info = await getUploadInfo();
  const safeScope = opts.scopeId.replace(/[^\w-]/g, "") || "adhoc";

  if (info.mode === "client-blob") {
    // 動的 import: オンプレのバンドルにはロードさせない
    const { upload } = await import("@vercel/blob/client");
    const baseType = (file.type || "application/octet-stream").split(";")[0].trim().toLowerCase();
    const ext = opts.fileName?.split(".").pop() || extensionForContentType(baseType);
    const pathname = `${APP_PREFIX}/media/${info.companyId}/${opts.kind}/${safeScope}/${Date.now()}.${ext}`;
    const result = await upload(pathname, file, {
      access: "public",
      handleUploadUrl: "/api/upload/media",
      clientPayload: JSON.stringify({ kind: opts.kind, mediaType: opts.mediaType }),
      multipart: file.size > 8 * 1024 * 1024,
      onUploadProgress: opts.onProgress
        ? ({ percentage }) => opts.onProgress!(percentage)
        : undefined,
    });
    return { url: result.url };
  }

  // ---- オンプレ: XHR で進捗付き multipart POST ----
  return new Promise<{ url: string }>((resolve, reject) => {
    const fd = new FormData();
    fd.append(
      "file",
      file instanceof File ? file : new File([file], opts.fileName ?? "media", { type: file.type })
    );
    fd.append("kind", opts.kind);
    fd.append("mediaType", opts.mediaType);
    fd.append("scopeId", safeScope);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload/media");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts.onProgress) {
        opts.onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300 && body.url) {
          resolve({ url: body.url });
        } else {
          reject(new Error(body.message ?? `アップロードに失敗しました (${xhr.status})`));
        }
      } catch {
        reject(new Error(`アップロードに失敗しました (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("通信エラーでアップロードに失敗しました"));
    xhr.send(fd);
  });
}
