"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { CheckCircle2 } from "lucide-react";
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
  const accountDeleted = searchParams.get("deleted") === "1";

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  // 戻る操作などでページが復元されたとき、押していないのに「ログイン中…」のまま
  // 表示される状態バグを防ぐ（bfcache 復元時にローディング状態をリセット）
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setLoading(false);
        setDemoLoading(false);
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

  /** 「ログインせずにデモを見る」: デモ会社を用意して即サインインする（社内紹介用）。 */
  async function startDemo() {
    setError("");
    setDemoLoading(true);
    try {
      const res = await fetch("/api/demo", { method: "POST" });
      if (!res.ok) throw new Error("demo setup failed");
      const creds = (await res.json()) as { email: string; password: string };
      const login = await signIn("credentials", {
        email: creds.email,
        password: creds.password,
        redirect: false,
      });
      if (login?.error) throw new Error(login.error);
      router.push("/");
      router.refresh();
    } catch {
      setError("デモの準備に失敗しました。少し時間をおいて再度お試しください。");
      setDemoLoading(false);
    }
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

          {/* アカウント削除（退会）完了の案内 */}
          {accountDeleted && (
            <div className="mb-4 flex items-start gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              アカウントを削除しました。ご利用ありがとうございました。
            </div>
          )}

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
              disabled={loading || demoLoading}
              className="w-full rounded-lg bg-[#f27524] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#c95e1a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "ログイン中…" : "ログイン"}
            </button>
          </form>

          {/* 社内紹介用: サンプルデータ入りのデモ会社にワンクリックで入る（実データには影響しない） */}
          <button
            type="button"
            onClick={startDemo}
            disabled={loading || demoLoading}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[#e5e5e5] bg-white px-4 py-2.5 text-sm font-semibold text-[#555555] transition-colors hover:bg-[#f7f7f5] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {demoLoading ? (
              <>
                <span
                  aria-hidden
                  className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#c9c9c9] border-t-transparent"
                />
                <span className="text-xs">デモの準備をしています（最大1分ほどかかります）</span>
              </>
            ) : (
              "ログインせずにデモを見る"
            )}
          </button>

          {/* ポータルで発行された社員番号アカウント（pending）の初回パスワード設定 */}
          <div className="mt-4 rounded-lg border border-[#f27524]/40 bg-[#fef3ec] px-3 py-2.5 text-center text-sm">
            <Link href="/first-login" className="font-semibold text-[#f27524] hover:underline">
              初めてログインする方はこちら（パスワード設定）
            </Link>
          </div>

          <div className="mt-3 text-center text-sm">
            <Link href="/password-reset" className="text-[#f27524] hover:underline">
              パスワードをお忘れの方はこちら
            </Link>
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
