"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { CheckCircle2 } from "lucide-react";

/** 初回パスワード設定画面（管理者から社員番号のみで発行されたアカウント向け）。 */
export default function FirstLoginPage() {
  const router = useRouter();

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("パスワードは8文字以上で設定してください。");
      return;
    }
    if (password !== password2) {
      setError("確認用のパスワードが一致しません。同じものを2回入力してください。");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/first-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId, password }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "設定に失敗しました。時間をおいて再度お試しください。");
        setLoading(false);
        return;
      }
      // 設定完了 → そのまま自動ログインしてトップへ（失敗時はログイン画面への案内を表示）
      const login = await signIn("credentials", { email: loginId, password, redirect: false });
      if (login?.error) {
        setDone(true);
        setLoading(false);
        return;
      }
      router.push("/");
      router.refresh();
      return;
    } catch {
      setError("通信エラーが発生しました。時間をおいて再度お試しください。");
    }
    setLoading(false);
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

          {done ? (
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-semibold text-gray-800">パスワードを設定しました</h2>
              <p className="mt-3 text-sm text-gray-600">
                ログイン画面から、社員番号と設定したパスワードでログインしてください。
              </p>
              <Link
                href="/login"
                className="mt-6 inline-block rounded-lg bg-[#f27524] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#c6601e]"
              >
                ログイン画面へ
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-[#333333] after:mt-2 after:block after:h-[3px] after:w-8 after:rounded-full after:bg-[#f27524] after:content-['']">初回パスワード設定</h2>
              <p className="mt-2 mb-6 text-sm text-gray-500">
                管理者から発行された社員番号で、はじめに使うパスワードを設定します。
              </p>
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
                    placeholder="例: 12345"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#333333] mb-1">
                    新しいパスワード（8文字以上）
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-[#d5d5d5] bg-white px-3 py-2 text-sm focus:border-[#f27524] focus:outline-none focus:ring-1 focus:ring-[#f27524]"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#333333] mb-1">
                    新しいパスワード（確認のためもう一度）
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
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
                  className="w-full rounded-lg bg-[#f27524] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#c6601e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? "設定中…" : "パスワードを設定してログイン"}
                </button>
              </form>

              <div className="mt-4 text-center text-sm">
                <Link href="/login" className="text-[#f27524] hover:underline">
                  ログイン画面へ戻る
                </Link>
              </div>
            </>
          )}
        </div>
        <div className="mt-4 text-center">
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
