"use client";

import { useState } from "react";

/**
 * ログイン画面の「管理者にお問い合わせください」から開くお問い合わせフォームモーダル。
 * メールクライアントが無い端末でも問い合わせできるよう、mailto の代わりにサーバー経由で送信する。
 */
export default function ContactAdminModal() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // ハニーポット（画面には出さない）
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [mailFallback, setMailFallback] = useState(false);

  function close() {
    setOpen(false);
    setError("");
    setMailFallback(false);
    if (done) {
      // 送信完了後に閉じたら次回はまっさらなフォームから
      setDone(false);
      setName("");
      setLoginId("");
      setMessage("");
      setWebsite("");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMailFallback(false);
    if (!message.trim()) {
      setError("お問い合わせ内容を入力してください");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/contact-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, loginId, message, website }),
      });
      if (res.ok) {
        setDone(true);
        return;
      }
      if (res.status === 503) {
        setMailFallback(true);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(
        typeof body.error === "string" && body.error
          ? body.error
          : "送信に失敗しました。時間をおいて再度お試しください。"
      );
    } catch {
      setError("送信に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[#707070] underline decoration-dotted underline-offset-2 transition-colors hover:text-[#f27524] hover:decoration-solid"
      >
        管理者にお問い合わせください
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="管理者へのお問い合わせ"
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white px-6 py-6 text-left shadow-xl">
            <h3 className="text-base font-semibold text-[#333333]">管理者へのお問い合わせ</h3>

            {done ? (
              <>
                <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
                  送信しました。管理者からの連絡をお待ちください。
                </p>
                <div className="mt-4 text-right">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-lg border border-[#d5d5d5] bg-white px-4 py-2 text-sm font-semibold text-[#555555] transition-colors hover:bg-[#f7f7f5]"
                  >
                    閉じる
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={onSubmit} className="mt-4 space-y-3">
                <p className="text-xs text-[#707070]">
                  メール未登録・ログインでお困りの方は、こちらから管理者へご連絡ください。
                </p>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#333333]">
                    お名前（任意）
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-[#d5d5d5] bg-white px-3 py-2 text-sm focus:border-[#f27524] focus:outline-none focus:ring-1 focus:ring-[#f27524]"
                    placeholder="例: 山田 太郎"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#333333]">
                    社員番号（任意）
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    className="w-full rounded-lg border border-[#d5d5d5] bg-white px-3 py-2 text-sm focus:border-[#f27524] focus:outline-none focus:ring-1 focus:ring-[#f27524]"
                    placeholder="例: 12345"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#333333]">
                    お問い合わせ内容<span className="ml-1 text-xs text-red-600">必須</span>
                  </label>
                  <textarea
                    required
                    rows={5}
                    maxLength={2000}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full rounded-lg border border-[#d5d5d5] bg-white px-3 py-2 text-sm focus:border-[#f27524] focus:outline-none focus:ring-1 focus:ring-[#f27524]"
                    placeholder="例: メールアドレスが未登録のためパスワード再設定ができません。登録をお願いします。"
                  />
                </div>

                {/* ハニーポット: 人間には見えない欄。bot が埋めたらサーバー側で破棄される */}
                <div className="hidden" aria-hidden="true">
                  <label>
                    Website
                    <input
                      type="text"
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </label>
                </div>

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                )}
                {mailFallback && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    現在フォーム送信が利用できません。メールで
                    <span className="mx-1 select-all font-semibold">info@paloma-pf.com</span>
                    までご連絡ください。
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={close}
                    disabled={sending}
                    className="rounded-lg border border-[#d5d5d5] bg-white px-4 py-2 text-sm font-semibold text-[#555555] transition-colors hover:bg-[#f7f7f5] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    閉じる
                  </button>
                  <button
                    type="submit"
                    disabled={sending}
                    className="rounded-lg bg-[#f27524] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#c95e1a] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sending ? "送信中…" : "送信"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
