import { isNativeApp } from "./native";

/**
 * 「撮影する」でカメラを直接起動する。
 *
 * Web では <input type="file" capture="environment"> でカメラが開くが、
 * iOS アプリ（Capacitor の WKWebView）は capture 属性を無視し、
 * 「写真を撮る / フォトライブラリ / ファイルを選択」のシートを挟んでしまう。
 * ネイティブでは @capacitor/camera でカメラだけを開いてこの一手間を無くす。
 *
 * 戻り値で呼び出し側の分岐を明示する:
 * - captured    : 撮影できた（そのままアップロードへ）
 * - cancelled   : ユーザーが取り消した（何もしない。file input を開くと押し付けになる）
 * - unavailable : Web／プラグイン未搭載（従来どおり file input にフォールバック）
 */
export type CaptureResult =
  | { status: "captured"; file: File }
  | { status: "cancelled" }
  | { status: "unavailable" };

/** Capacitor Camera が取消時に返すメッセージ（プラグイン未搭載エラーと区別する）。 */
function isCancellation(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e ?? "")).toLowerCase();
  return msg.includes("cancel") || msg.includes("user denied") || msg.includes("no image picked");
}

export async function captureFromNativeCamera(): Promise<CaptureResult> {
  if (!isNativeApp()) return { status: "unavailable" };
  try {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera, // ライブラリを挟まずカメラを直接起動
      resultType: CameraResultType.Uri, // Base64 は大きな写真でメモリを圧迫するため Uri
      quality: 90,
      allowEditing: false,
      saveToGallery: false,
      correctOrientation: true,
    });
    if (!photo.webPath) return { status: "unavailable" };
    const blob = await (await fetch(photo.webPath)).blob();
    if (blob.size === 0) return { status: "unavailable" };
    const ext = photo.format || "jpeg";
    return {
      status: "captured",
      file: new File([blob], `camera-${Date.now()}.${ext}`, {
        type: blob.type || `image/${ext}`,
      }),
    };
  } catch (e) {
    if (isCancellation(e)) return { status: "cancelled" };
    // プラグイン未同期・権限未設定などは Web と同じ導線に落とす（撮影自体は継続できる）
    console.warn("[capturePhoto] native camera unavailable:", e);
    return { status: "unavailable" };
  }
}
