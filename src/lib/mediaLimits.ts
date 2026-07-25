/**
 * メディア(写真・音声・動画)の上限とMIMEホワイトリスト。
 * client/server 共有の純定数("use client" なし)。
 * 動画・音声の「長さ」はサーバーで検証できない(ffprobe なし)ため、
 * クライアント検証+申告値保存とし、サイズ上限だけがサーバー側のハード制限。
 */

export const MEDIA_MAX_BYTES = 50 * 1024 * 1024; // 音声・動画の1ファイル上限
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 画像(圧縮後に効く保険)
export const VIDEO_MAX_SECONDS = 30;
export const AUDIO_MAX_SECONDS = 60;
export const MAX_RESULT_MEDIA_PER_ITEM = 5; // 点検記録の項目あたり
export const MAX_REFERENCE_MEDIA_PER_ITEM = 10; // 正常見本の項目あたり

/**
 * アップロード前の動画再エンコード設定（videoCompress.ts）。
 * スマホ撮影の 1080p/10Mbps 超をこの水準まで落として送る＝転送量おおむね 1/5〜1/10。
 * 現場で漏れ・部品の状態が判別できる画質は保つ値にしている。
 */
export const VIDEO_TARGET_MAX_EDGE = 960; // 長辺 px
export const VIDEO_TARGET_BITRATE = 2_000_000; // 映像 bps
export const VIDEO_TARGET_AUDIO_BITRATE = 64_000; // 音声 bps（異音の確認用に残す）
export const VIDEO_TARGET_FPS = 24;

export const ALLOWED_MEDIA_CONTENT_TYPES: Record<"photo" | "audio" | "video" | "image", string[]> = {
  photo: ["image/jpeg", "image/png", "image/webp"],
  image: ["image/jpeg", "image/png", "image/webp"], // マップ・箇所写真用(photo と同一)
  // iOS Safari の MediaRecorder は audio/mp4 のみ。Chrome/Android は audio/webm
  audio: ["audio/mp4", "audio/webm", "audio/mpeg", "audio/wav"],
  // iOS のカメラ撮影は video/quicktime(.mov)
  video: ["video/mp4", "video/quicktime", "video/webm"],
};

/** content-type から保存用の拡張子を決める(local ドライバの配信 MIME 判定に使う)。 */
export function extensionForContentType(contentType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "audio/mp4": "m4a",
    "audio/webm": "weba",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
  };
  const base = contentType.split(";")[0].trim().toLowerCase();
  return map[base] ?? "bin";
}
