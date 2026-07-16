"use client";

import { Printer } from "lucide-react";

/** ブラウザの印刷ダイアログを開く（「PDFとして保存」で PDF 化できる）。 */
export default function PrintButton({ className = "" }: { className?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className={`no-print inline-flex items-center gap-1.5 rounded-lg bg-orange-700 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-800 ${className}`}
    >
      <Printer className="h-4 w-4" />
      印刷 / PDF保存
    </button>
  );
}
