import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "./authOptions";
import { getCompanyEntitlement } from "./entitlement";
import { getUserRoleAndFactory } from "./authDb";

/**
 * ログイン中の会社ID・会社名・ユーザー名を返す。
 * 未ログインなら /login にリダイレクト（Server Component / Server Action 用）。
 */
export async function requireSession(): Promise<{
  companyId: string;
  companyName: string;
  userId: string;
  userName: string;
  email: string;
  isDemo: boolean;
}> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId) {
    redirect("/login");
  }
  return {
    companyId: session.user.companyId,
    companyName: session.user.companyName,
    userId: session.user.id,
    userName: session.user.name ?? "",
    email: session.user.email ?? "",
    isDemo: session.user.isDemo ?? false,
  };
}

/**
 * ログイン＋利用権を要求。未ログイン・利用権なしは /login にリダイレクト。
 * オンプレ運用（ON_PREMISE=1）では利用権は常に有効（entitlement.ts の短絡）。
 * データを描画/更新する Server Component・Server Action はこれを使う。
 */
export async function requireEntitledSession(): Promise<{
  companyId: string;
  companyName: string;
  userId: string;
  userName: string;
  email: string;
  isDemo: boolean;
}> {
  const s = await requireSession();
  let active = true;
  try {
    active = (await getCompanyEntitlement(s.companyId)).active;
  } catch (e) {
    // 課金チェックの一時失敗で利用を止めない（フェイルオープン）
    console.error("[entitlement] check failed, allowing:", e);
    return s;
  }
  if (!active) {
    redirect("/login");
  }
  return s;
}

/** リダイレクトせず、未ログインなら null を返す（任意表示用）。 */
export async function getOptionalSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId) return null;
  return session.user;
}

/**
 * ログイン中のセッション＋ユーザーの役割（role）・所属工場（factory）を返す。未ログインなら null。
 * リダイレクトしないので、API route 側で 401/403 を返せる（メンバー管理などの管理系APIで使う）。
 * role/factory は同一クエリで DB から都度取得する（JWT には載せない＝既存セッションでも即時反映される）。
 */
export async function getSessionWithRole(): Promise<{
  companyId: string;
  companyName: string;
  userId: string;
  userName: string;
  email: string;
  isDemo: boolean;
  role: "admin" | "member" | null;
  factory: string | null;
} | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId) return null;
  const rf = await getUserRoleAndFactory(session.user.id);
  return {
    companyId: session.user.companyId,
    companyName: session.user.companyName,
    userId: session.user.id,
    userName: session.user.name ?? "",
    email: session.user.email ?? "",
    isDemo: session.user.isDemo ?? false,
    role: rf?.role ?? null,
    factory: rf?.factory ?? null,
  };
}
