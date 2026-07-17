"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";

/** パスワード再設定（メールアドレス入力→再設定リンクを送信）。 */
export default function PasswordResetPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.message || "送信に失敗しました。時間をおいて再度お試しください。");
        setLoading(false);
        return;
      }
      setSent(true);
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
            <p className="mt-1 text-xs text-[#707070]">パスワードの再設定</p>
          </div>

          {sent ? (
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <MailCheck className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-semibold text-gray-800">メールを送信しました</h2>
              <p className="mt-3 text-sm leading-relaxed text-gray-600">
                ご登録のメールアドレスであれば、パスワード再設定用のリンクをお送りしています。
                メール内のリンクを<strong>60分以内</strong>に開いて、新しいパスワードを設定してください。
              </p>
              <p className="mt-3 text-xs text-gray-400">
                数分たってもメールが届かない場合は、入力したアドレスが登録済みのものかどうか、
                迷惑メールフォルダに入っていないかをご確認ください。
              </p>
              <Link
                href="/login"
                className="mt-6 inline-block rounded-lg bg-[#f27524] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#c6601e]"
              >
                ログイン画面へ戻る
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-[#333333] after:mt-2 after:block after:h-[3px] after:w-8 after:rounded-full after:bg-[#f27524] after:content-['']">パスワードをお忘れの方</h2>
              <p className="mt-2 mb-6 text-sm leading-relaxed text-gray-500">
                ご登録のメールアドレスを入力して「送信」を押してください。
                パスワードを再設定するためのリンクをメールでお送りします。
              </p>
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#333333] mb-1">メールアドレス</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-[#d5d5d5] bg-white px-3 py-2 text-sm focus:border-[#f27524] focus:outline-none focus:ring-1 focus:ring-[#f27524]"
                    placeholder="you@example.com"
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
                  {loading ? "送信中…" : "再設定用のメールを送信"}
                </button>
              </form>
              <div className="mt-5 text-center text-sm text-gray-500">
                <Link href="/login" className="text-[#f27524] hover:underline font-medium">
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
