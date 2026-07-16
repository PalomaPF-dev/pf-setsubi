"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

/**
 * 管理番号の手入力で設備を開く（QRの代替）。
 * 完全一致ならその設備詳細へ、無ければ台帳検索結果へフォールバック。
 */
export default function ManualLookup({
  placeholder = "例: S-0001",
  submitLabel = "開く",
}: {
  placeholder?: string;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/equipment/lookup?managementNo=${encodeURIComponent(v)}`);
      if (!res.ok) throw new Error("lookup failed");
      const data = (await res.json()) as { id: string | null };
      router.push(data.id ? `/equipment/${data.id}` : `/equipment?q=${encodeURIComponent(v)}`);
    } catch {
      setError("検索に失敗しました。もう一度お試しください。");
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            enterKeyHint="search"
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>
        <button
          type="submit"
          disabled={busy || value.trim() === ""}
          className="shrink-0 rounded-lg bg-orange-700 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-800 disabled:opacity-60"
        >
          {busy ? "検索中…" : submitLabel}
        </button>
      </form>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
