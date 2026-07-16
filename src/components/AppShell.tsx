"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Factory,
  CalendarClock,
  ClipboardList,
  History,
  QrCode,
  Menu,
  X,
  LogOut,
  Settings,
  Wrench,
  BookOpen,
  LayoutGrid,
} from "lucide-react";

const NAV = [
  { href: "/", label: "ダッシュボード", icon: LayoutDashboard },
  { href: "/equipment", label: "設備台帳", icon: Factory },
  { href: "/scan", label: "点検・スキャン", icon: QrCode },
  { href: "/checklists", label: "点検手順書", icon: ClipboardList },
  { href: "/inspections", label: "点検履歴", icon: History },
  { href: "/actions", label: "処置管理", icon: Wrench },
  { href: "/schedule", label: "点検期限", icon: CalendarClock },
  { href: "/settings", label: "設定", icon: Settings },
  { href: "/help", label: "使い方", icon: BookOpen },
];

// ログイン/登録などの認証ページではシェル（サイドバー）を出さない
const BARE_ROUTES = [
  "/login",
  "/register",
  "/password-reset",
  "/password-reset/confirm",
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-r-lg border-l-[3px] px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "border-[#f27524] bg-[#f27524]/5 text-[#f27524]"
                : "border-transparent text-[#555555] hover:bg-[#f7f7f5] hover:text-[#333333]"
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {label}
          </Link>
        );
      })}
      {/* PFアプリポータルへ（外部リンクなので通常の a タグ） */}
      <div className="my-1 border-t border-[#eeeeee]" />
      <a
        href="https://pf-apps.vercel.app"
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-r-lg border-l-[3px] border-transparent px-3 py-2.5 text-sm font-medium text-[#555555] transition-colors hover:bg-[#f7f7f5] hover:text-[#333333]"
      >
        <LayoutGrid className="h-5 w-5 shrink-0" />
        ポータル
      </a>
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-5 py-4">
      <img src="/icon-192.png" alt="" className="h-9 w-9 rounded-[9px]" />
      <div className="leading-tight">
        <div className="whitespace-nowrap text-sm font-bold text-[#333333]">PF設備管理</div>
        <div className="text-[10px] text-[#707070]">設備管理・点検</div>
      </div>
    </div>
  );
}

function UserFooter() {
  const { data: session } = useSession();
  if (!session?.user) return null;
  return (
    <div className="mt-auto border-t border-[#e5e5e5] px-4 py-3">
      <div className="mb-2 truncate text-xs text-[#707070]">
        {session.user.companyName}
        <span className="mx-1 text-slate-300">/</span>
        {session.user.name}
      </div>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e5e5e5] px-3 py-2 text-xs font-medium text-[#555555] hover:bg-[#f7f7f5]"
      >
        <LogOut className="h-4 w-4" />
        ログアウト
      </button>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (BARE_ROUTES.includes(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="print-root flex h-screen flex-col overflow-hidden bg-slate-50">
      {/* パロマ・ブランドライン */}
      <div className="no-print h-1 shrink-0 bg-[#f27524]" />
      <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* PC サイドバー */}
      <aside className="no-print hidden w-64 shrink-0 flex-col border-r border-[#e5e5e5] bg-white wide:flex">
        <Brand />
        <div className="flex-1 overflow-y-auto py-2">
          <NavLinks />
        </div>
        <UserFooter />
      </aside>

      {/* モバイルドロワー */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 wide:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between pr-2">
              <Brand />
              <button
                onClick={() => setDrawerOpen(false)}
                className="rounded p-2 text-slate-500 hover:bg-slate-100"
                aria-label="メニューを閉じる"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              <NavLinks onNavigate={() => setDrawerOpen(false)} />
            </div>
            <UserFooter />
          </aside>
        </div>
      )}

      {/* メイン */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-[#e5e5e5] bg-white px-3 wide:hidden no-print">
          <button
            onClick={() => setDrawerOpen(true)}
            className="rounded p-2 text-[#555555] hover:bg-[#f7f7f5]"
            aria-label="メニューを開く"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-2">
            <img src="/icon-192.png" alt="" className="h-7 w-7 rounded-md" />
            <span className="whitespace-nowrap text-sm font-bold text-[#333333]">PF設備管理</span>
          </div>
        </header>
        <main className="print-main flex-1 overflow-y-auto">{children}</main>
      </div>
      </div>
    </div>
  );
}
