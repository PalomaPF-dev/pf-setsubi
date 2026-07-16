/**
 * Capacitor の webview（iOSアプリ）内で動作しているかを判定。
 * App Store 審査要件（3.1.1）により、アプリ内では Web の外部課金導線を出さない。
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  // Capacitor がランタイムで注入するグローバルで判定
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; isNative?: boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.() ?? cap?.isNative);
}
