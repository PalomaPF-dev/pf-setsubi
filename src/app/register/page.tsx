import Link from "next/link";
import { countAdmins, ensureAuthSchema } from "@/lib/authDb";
import InitialSetupForm from "@/components/InitialSetupForm";

export const dynamic = "force-dynamic";

/**
 * 初期セットアップ画面（公開登録の置き換え）。
 * - 管理者が0人（＝まだ誰もセットアップしていない）→ 管理者アカウント作成フォームを表示。
 * - 既に管理者がいる → 「アカウントは管理者が発行します」の案内のみ（自己登録フォームは出さない）。
 */
export default async function RegisterPage() {
  // 空DBでは users テーブル未作成で countAdmins が失敗するため、初期化してから数える。
  // 何らかの理由で失敗しても「未セットアップ扱い（0人）」にしてセットアップ導線を残す。
  let adminCount = 0;
  try {
    await ensureAuthSchema();
    adminCount = await countAdmins();
  } catch {
    adminCount = 0;
  }
  const setupDone = adminCount > 0;

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f7f5]">
      <div className="h-1 shrink-0 bg-[#f27524]" />
      <div className="flex flex-1 items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl border border-[#e5e5e5] bg-white p-8">
        <div className="mb-6 flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" className="mx-auto h-16 w-16 rounded-2xl" />
          <p className="text-xs text-[#707070] tracking-wide">生産・調達統括本部</p>
          <h1 className="text-lg font-bold text-[#333333]">
            {setupDone ? "アカウントについて" : "初期セットアップ"}
          </h1>
          <p className="text-xs text-[#707070]">PF設備管理</p>
        </div>

        {setupDone ? (
          <div className="text-center text-sm text-slate-600">
            <p>アカウントは管理者が発行します。</p>
            <p className="mt-1 text-xs text-slate-400">
              ご利用には、社内の管理者にアカウントの発行を依頼してください。
            </p>
            <p className="mt-4">
              ログインは{" "}
              <Link href="/login" className="font-medium text-[#f27524] hover:underline">
                こちら
              </Link>
            </p>
          </div>
        ) : (
          <>
            <p className="mb-4 text-center text-xs font-medium text-slate-500">
              管理者アカウントの作成
            </p>
            <InitialSetupForm />
          </>
        )}
        <div className="mt-6 text-center">
          <a
            href="https://pf-apps.vercel.app"
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
