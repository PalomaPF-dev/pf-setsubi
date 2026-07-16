import Link from "next/link";
import { Factory } from "lucide-react";

/** 404（日本語）。存在しない URL を開いたときにダッシュボードへ誘導する。 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
          <Factory className="h-7 w-7" />
        </div>
        <p className="text-sm font-bold text-orange-700">404</p>
        <h1 className="mt-1 text-lg font-bold text-slate-800">ページが見つかりません</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-500">
          お探しのページは移動したか、削除された可能性があります。
          アドレス（URL）に誤りがないかご確認ください。
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-orange-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-orange-800"
        >
          ダッシュボードへ戻る
        </Link>
      </div>
    </div>
  );
}
