import { Database } from "lucide-react";

/** DATABASE_URL 未設定や接続失敗時に、画面を落とさず案内を出す。 */
export default function DbErrorState() {
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
        <Database className="h-6 w-6" />
      </div>
      <h2 className="text-base font-bold text-amber-800">データベース未接続</h2>
      <p className="mt-2 text-sm text-amber-700">
        Neon Postgres への接続が設定されていません。
        <br />
        <code className="rounded bg-amber-100 px-1">DATABASE_URL</code> を{" "}
        <code className="rounded bg-amber-100 px-1">.env.local</code> に設定するか、
        Vercel で Neon を接続してください。
      </p>
    </div>
  );
}
