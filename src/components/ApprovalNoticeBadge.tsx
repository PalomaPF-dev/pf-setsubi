"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Stamp } from "lucide-react";

/**
 * 管理者向け・承認待ち件数バッジ（全ページ共通シェルに常時表示）。
 * /api/my-approvals から自分宛ての承認待ち件数を取得し、1件以上あれば
 * 赤いピルで「承認待ち N件」（compact 時は「承認 N」）を表示して
 * 点検履歴の承認待ち一覧（/inspections?approval=pending）へ誘導する。
 * 0件・未ログイン・取得エラー時は何も表示しない。
 * マウント時に取得し、ウィンドウフォーカス時に再取得する。
 */

// 同時マウント（PCサイドバー＋モバイルヘッダー）でのリクエスト重複を防ぐ共有 Promise
let inflight: Promise<number> | null = null;

function fetchPendingCount(): Promise<number> {
  if (!inflight) {
    inflight = (async () => {
      try {
        const res = await fetch("/api/my-approvals", { cache: "no-store" });
        if (!res.ok) return 0;
        const data = (await res.json()) as { pending?: unknown };
        return typeof data.pending === "number" && Number.isFinite(data.pending)
          ? data.pending
          : 0;
      } catch {
        return 0;
      } finally {
        // 応答後に解放（次回フォーカス時はあらためて取得する）
        setTimeout(() => {
          inflight = null;
        }, 0);
      }
    })();
  }
  return inflight;
}

export default function ApprovalNoticeBadge({ compact = false }: { compact?: boolean }) {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let active = true;
    const load = () => {
      fetchPendingCount().then((n) => {
        if (active) setPending(n);
      });
    };
    load();
    window.addEventListener("focus", load);
    return () => {
      active = false;
      window.removeEventListener("focus", load);
    };
  }, []);

  if (pending <= 0) return null;

  return (
    <Link
      href="/inspections?approval=pending"
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#dc2626] px-2.5 py-1 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#b91c1c]"
      aria-label={`承認待ち ${pending}件`}
    >
      <Stamp className="h-3.5 w-3.5 shrink-0" />
      {compact ? `承認 ${pending}` : `承認待ち ${pending}件`}
    </Link>
  );
}
