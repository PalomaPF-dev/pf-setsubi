import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "jp.sumakouba.setsubi",
  appName: "Paloma設備管理",
  // リモート読込方式：本番の Next.js（next-auth）をそのまま webview で表示。
  // server.url 設定時、webDir はオフライン時のフォールバックとして使われる。
  webDir: "capacitor-shell",
  server: {
    url: "https://sumakouba-setsubi.vercel.app",
    cleartext: false,
  },
  ios: {
    backgroundColor: "#f8fafc",
    contentInset: "automatic",
  },
};

export default config;
