"use client";

/**
 * 撮影写真をアップロード前に縮小・JPEG 再エンコードする（クライアント専用）。
 * - iPhone の写真は 2〜5MB / HEIC のことがあり、そのままでは Server Action の
 *   ボディ上限や通信量の面で不利。canvas 経由の再エンコードで HEIC 対策も兼ねる。
 * - 長辺 maxEdge px・quality 0.8 の JPEG に変換。変換に失敗したら元ファイルを返す
 *   （サーバー側の 8MB 上限が保険）。
 */
export async function compressImageFile(
  file: File,
  maxEdge = 1600,
  quality = 0.8
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob) return file;
    // 変換で大きくなってしまった場合は元のまま
    if (blob.size >= file.size && file.type === "image/jpeg") return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
