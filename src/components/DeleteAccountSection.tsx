"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

/**
 * 設定画面 最下部の「危険な操作」ゾーン（アカウント削除＝退会）。
 * 確認欄に「削除」と入力しないと実行できない。デモでは呼び出し元で非表示にする。
 */
export default function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canDelete = confirmText.trim() === "削除";

  async function onDelete() {
    if (!canDelete || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.message || "削除に失敗しました。時間をおいて再度お試しください。");
        setBusy(false);
        return;
      }
      // 削除完了 → サインアウトしてログイン画面へ（完了メッセージ付き）
      await signOut({ callbackUrl: "/login?deleted=1" });
    } catch {
      setError("通信エラーが発生しました。時間をおいて再度お試しください。");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border-2 border-red-200 bg-white p-5">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-red-700">
        <AlertTriangle className="h-4 w-4" />
        危険な操作
      </h2>
      <p className="mb-4 text-xs text-slate-500">
        アカウントの削除（退会）を行います。一度削除すると元に戻せませんので、十分ご注意ください。
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
          アカウントを削除（退会）
        </button>
      ) : (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-bold text-red-700">
            この操作は元に戻せません。すべてのデータが削除されます。
          </p>
          <ul className="mt-2 list-disc pl-5 text-xs leading-relaxed text-red-700">
            <li>
              あなたが会社で唯一のユーザーの場合、設備台帳・点検手順書・点検記録・写真など、
              会社のすべてのデータが完全に削除されます。
            </li>
            <li>
              会社に他のユーザーがいる場合は、あなたのアカウントのみ削除され、会社のデータは残ります。
            </li>
          </ul>
          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium text-red-700">
              削除する場合は、確認のため下の欄に「削除」と入力してください
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="削除"
              className="w-full max-w-xs rounded-lg border border-red-300 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>
          {error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onDelete}
              disabled={!canDelete || busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {busy ? "削除しています…" : "アカウントを完全に削除する"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirmText("");
                setError("");
              }}
              disabled={busy}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
