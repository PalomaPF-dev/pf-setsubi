import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import AppShell from "@/components/AppShell";
import { getOptionalSession } from "@/lib/session";
import { getUserRoleAndFactory } from "@/lib/authDb";

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
    <html lang="ja">
      <body className="antialiased">
        <Providers>
          <AppShell isAdmin={isAdmin}>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
