"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, UserPlus, Trash2, Loader2 } from "lucide-react";

type Worker = {
  id: string;
  name: string;
  createdAt: string;
};

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

/**
 * 作業者管理（ログイン中のアカウントなら誰でも操作可）。
 * アカウント管理はポータルに集約されたため、アプリ内では作業者の「名前」だけを
 * 登録し、記録入力時に自分の名前を選択してもらう。
 */
export default function WorkerManagement() {
  const [workers, setWorkers] = useState<Worker[] | null>(null);
  const [loadError, setLoadError] = useState("");

  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch("/api/workers");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setWorkers(data.workers as Worker[]);
    } catch {
      setLoadError("作業者一覧の取得に失敗しました。画面を更新してください。");
      setWorkers([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (adding) return;
    setFormError("");
    setAdding(true);
    try {
      const res = await fetch("/api/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.message || "追加に失敗しました。");
        return;
      }
      setName("");
      await load();
    } catch {
      setFormError("通信エラーが発生しました。");
    } finally {
      setAdding(false);
    }
  }

  async function onDelete(w: Worker) {
    if (deletingId) return;
    if (!confirm(`作業者「${w.name}」を削除しますか？過去の記録の氏名はそのまま残ります。`)) return;
    setDeletingId(w.id);
    try {
      const res = await fetch("/api/workers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: w.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.message || "削除に失敗しました。");
        return;
      }
      await load();
    } catch {
      alert("通信エラーが発生しました。");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-slate-700">
        <Users className="h-4 w-4 text-orange-500" />
        作業者管理
      </h2>
      <p className="mb-4 text-xs text-slate-400">
        記録入力時に作業者が自分の名前を選択できるようになります。アカウント管理はポータルで行います。
      </p>

      {workers === null ? (
        <div className="mb-4 flex items-center justify-center gap-2 py-6 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          読み込み中…
        </div>
      ) : loadError ? (
        <p className="mb-4 rounded-xl border border-dashed border-red-200 bg-red-50 py-4 text-center text-sm text-red-600">
          {loadError}
        </p>
      ) : workers.length === 0 ? (
        <p className="mb-4 rounded-xl border border-dashed border-slate-300 py-6 text-center text-sm text-slate-400">
          作業者はまだ登録されていません。
        </p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {workers.map((w) => (
            <li key={w.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                {w.name}
              </span>
              <button
                type="button"
                onClick={() => onDelete(w)}
                disabled={deletingId === w.id}
                className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                aria-label={`「${w.name}」を削除`}
              >
                {deletingId === w.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                削除
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 追加フォーム */}
      <form onSubmit={onAdd} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 flex items-center gap-1.5 text-sm font-medium text-slate-600">
          <UserPlus className="h-4 w-4 text-orange-500" />
          作業者を追加
        </div>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={50}
              placeholder="例: 山田 太郎"
              className={inputCls}
              aria-label="作業者名"
            />
            {formError && <p className="mt-1 text-sm text-red-600">{formError}</p>}
          </div>
          <button
            type="submit"
            disabled={adding}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#f27524] px-4 py-2 text-sm font-semibold text-white hover:bg-[#c6601e] disabled:opacity-60"
          >
            {adding ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                追加中…
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" />
                追加
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
