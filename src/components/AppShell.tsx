"use client";

import { useSession, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Factory,
  CalendarClock,
  ClipboardList,
  History,
  QrCode,
  LogOut,
  Mail,
  Settings,
  Wrench,
  BookOpen,
} from "lucide-react";
import { AppShell as BaseAppShell, type NavItem } from "@paloma-pf/ui";
import ApprovalNoticeBadge from "./ApprovalNoticeBadge";

const NAV: NavItem[] = [
  { href: "/", label: "ダッシュボード", icon: LayoutDashboard },
  { href: "/equipment", label: "設備台帳", icon: Factory },
  { href: "/scan", label: "点検・スキャン", icon: QrCode },
  // 点検手順書（点検項目マスタ）はマスタ設定＝管理者のみ
  { href: "/checklists", label: "点検手順書", icon: ClipboardList, adminOnly: true },
  { href: "/inspections", label: "点検履歴", icon: History },
  { href: "/actions", label: "処置管理", icon: Wrench },
  { href: "/schedule", label: "点検期限", icon: CalendarClock },
  { href: "/settings", label: "設定", icon: Settings },
  { href: "/help", label: "使い方", icon: BookOpen },
];

/** ログインユーザー表示とログアウト。next-auth 依存のためアプリ側に置く。 */
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
      {/* ポータルのお問い合わせフォーム（このアプリを選択した状態で開く） */}
      <a
        href="https://portal.paloma-pf.com/?contact=setsubi"
        target="_blank"
        rel="noopener noreferrer"
        className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-[#e5e5e5] px-3 py-2 text-xs font-medium text-[#555555] hover:bg-[#f7f7f5]"
      >
        <Mail className="h-4 w-4" />
        お問い合わせ
      </a>
      <button
        onClick={() => {
          void signOut({ redirect: false }).then(() => {
            window.location.href = "https://portal.paloma-pf.com/";
          });
        }}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e5e5e5] px-3 py-2 text-xs font-medium text-[#555555] hover:bg-[#f7f7f5]"
      >
        <LogOut className="h-4 w-4" />
        ログアウト
      </button>
    </div>
  );
}

/**
 * 設備アプリのシェル。共通の @paloma-pf/ui の AppShell に、
 * このアプリ固有のナビ・承認バッジ・ユーザー情報を差し込む。
 */
export default function AppShell({
  children,
  isAdmin = false,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
}) {
  return (
    <BaseAppShell
      nav={NAV}
      brand={{ eyebrow: "株式会社パロマ", title: "PF設備管理", subtitle: "設備管理・点検" }}
      isAdmin={isAdmin}
      // 管理者向け: 自分宛ての承認待ちがあれば常時表示（全ページ共通）
      sidebarTop={<ApprovalNoticeBadge />}
      headerRight={<ApprovalNoticeBadge compact />}
      sidebarFooter={<UserFooter />}
    >
      {children}
    </BaseAppShell>
  );
}
