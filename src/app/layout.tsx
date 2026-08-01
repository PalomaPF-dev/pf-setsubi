import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import AppShell from "@/components/AppShell";
import { getOptionalSession } from "@/lib/session";
import { getUserRoleAndFactory } from "@/lib/authDb";

/**
 * 本文フォント。OS標準任せだと Mac=ヒラギノ / Windows=メイリオ で見え方が変わるため、
 * PFシリーズ共通のフォントを配信して両OSで同じ表示にする（ポータルと同じ Noto Sans JP）。
 * next/font はビルド時にフォントを取り込んで自前配信するので、実行時の外部リクエストは無い。
 */
const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "PF設備管理",
  description: "製造現場向け 設備管理・点検システム（設備台帳・点検記録・期限アラート）",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "PF設備管理", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#ea580c",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // ナビの「点検手順書」など、マスタ系リンクの出し分け用に管理者かどうかを解決する。
  // role はセッション（JWT）に載せていないため DB から取得する。未ログイン時は false。
  let isAdmin = false;
  try {
    const sessionUser = await getOptionalSession();
    if (sessionUser) {
      const rf = await getUserRoleAndFactory(sessionUser.id);
      isAdmin = (rf?.role ?? "admin") === "admin";
    }
  } catch {
    isAdmin = false;
  }
  return (
    <html lang="ja" className={notoSansJP.variable}>
      <body className="antialiased">
        <Providers>
          <AppShell isAdmin={isAdmin}>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
