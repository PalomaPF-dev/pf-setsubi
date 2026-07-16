"use client";

import { useState } from "react";
import { Hash } from "lucide-react";

export default function AutoManagementNoButton() {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  async function fill() {
    setLoading(true);
    try {
      const res = await fetch("/api/equipment/next-no", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const { no, error } = await res.json();
      if (error) { alert(error); return; }
      const input = document.querySelector('input[name="managementNo"]') as HTMLInputElement | null;
      if (input) {
        input.value = no;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      setPreview(no);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={fill}
      disabled={loading}
      className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
    >
      <Hash className="h-3.5 w-3.5" />
      {loading ? "採番中…" : preview ? `→ ${preview}` : "自動採番"}
    </button>
  );
}
