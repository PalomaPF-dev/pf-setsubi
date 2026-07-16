"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * アプリ全体のエラーバウンダリ。
 * 本番ビルドではサーバー側エラーの詳細はマスクされるため、日本語の案内と再試行だけを出す
 * （フォーム系 Server Action の失敗が Next.js 既定の英語エラー画面になるのを防ぐ）。
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="text-base font-bold text-slate-800">処理に失敗しました</h2>
        <p className="mt-2 text-sm text-slate-600">
          入力内容に問題があるか、一時的な通信エラーの可能性があります。
          もう一度お試しいただくか、前の画面に戻って内容をご確認ください。
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={() => reset()}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-orange-700 px-4 text-sm font-semibold text-white hover:bg-orange-800"
          >
            <RotateCcw className="h-4 w-4" />
            再試行
          </button>
          <button
            onClick={() => window.history.back()}
            className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            前の画面に戻る
          </button>
        </div>
      </div>
    </div>
  );
}
