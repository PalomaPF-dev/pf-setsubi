"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import ContactAdminModal from "@/components/ContactAdminModal";

// useSearchParams はプリレンダー時に Suspense 境界が必要
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // ログイン後の戻り先（オープンリダイレクト防止でアプリ内パスのみ許可）
  const rawCallback = searchParams.get("callbackUrl") ?? "";
  const callbackUrl =
    rawCallback.startsWith("/") && !rawCallback.startsWith("//") ? rawCallback : "/";

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 戻る操作などでページが復元されたとき、押していないのに「ログイン中…」のまま
  // 表示される状態バグを防ぐ（bfcache 復元時にローディング状態をリセット）
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setLoading(false);
      }
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    // credentials のフィールド名は互換のため email（中身は社員番号 or 従来のメールアドレス）
    const res = await signIn("credentials", { email: loginId, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      // authorize が明示的に throw したメッセージ（パスワード未設定など）はそのまま表示
      setError(
        res.error !== "CredentialsSignin" ? res.error : "社員番号またはパスワードが違います。"
      );
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f7f5]">
      <div className="h-1 shrink-0 bg-[#f27524]" />
      <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-[#e5e5e5] bg-white px-8 py-8">
          <div className="mb-6 flex flex-col items-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="" className="mx-auto mb-3 h-16 w-16 rounded-2xl" />
            <p className="text-xs text-[#707070] tracking-wide">生産・調達統括本部</p>
            <h1 className="text-xl font-bold text-[#333333]">PF設備管理</h1>
            <p className="mt-1 text-xs text-[#707070]">設備管理・点検システム</p>
          </div>

          <h2 className="mb-6 text-lg font-semibold text-[#333333] after:mt-2 after:block after:h-[3px] after:w-8 after:rounded-full after:bg-[#f27524] after:content-['']">ログイン</h2>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#333333] mb-1">社員番号</label>
              <input
                type="text"
                autoComplete="username"
                required
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="w-full rounded-lg border border-[#d5d5d5] bg-white px-3 py-2 text-sm focus:border-[#f27524] focus:outline-none focus:ring-1 focus:ring-[#f27524]"
                placeholder="例: 12345（管理者は admin）"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#333333] mb-1">パスワード</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-[#d5d5d5] bg-white px-3 py-2 text-sm focus:border-[#f27524] focus:outline-none focus:ring-1 focus:ring-[#f27524]"
                placeholder="••••••••"
              />
            </div>
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#f27524] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#c95e1a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "ログイン中…" : "ログイン"}
            </button>
          </form>

          {/* ポータル一括ログイン（ポータルでログイン済みなら各アプリは自動ログイン） */}
          <div className="mt-4 rounded-lg border border-[#f27524]/40 bg-[#fef3ec] px-3 py-2.5 text-center text-sm">
            <a href="https://portal.paloma-pf.com/" className="font-semibold text-[#f27524] hover:underline">
              ポータルから一括ログイン
            </a>
          </div>
          <p className="mt-2 text-center text-xs text-[#707070]">
            ポータルでログインすると各アプリは自動でログインされます
          </p>

          <div className="mt-3 text-center text-sm">
            <span className="text-[#707070]">パスワードの再設定はポータルで行います</span>
            <p className="mt-1 text-xs text-[#707070]">
              メール未登録の方は
              <ContactAdminModal />
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-[#707070]">
          設備の台帳・点検記録・期限管理を一元化するツール
        </p>
        <div className="mt-3 text-center">
          <a
            href="https://portal.paloma-pf.com"
            className="text-sm text-[#707070] transition-colors hover:text-[#f27524]"
          >
            ← ポータルへ戻る
          </a>
        </div>
      </div>
      </div>
    </div>
  );
}
