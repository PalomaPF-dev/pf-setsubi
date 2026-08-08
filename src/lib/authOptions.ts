import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getSql } from "./neon";

// localhost のクッキーはポートを跨いで共有されるため、既定名（next-auth.session-token）のままだと
// 他のPFアプリの開発サーバーと相互上書きになり JWEDecryptionFailed が起きる。
// アプリ固有のクッキー名にして分離する（本番でも無害）。
// Vercel 上は NEXTAUTH_URL 未設定（VERCEL_URL フォールバック）でも必ず HTTPS。
const useSecureCookies =
  (process.env.NEXTAUTH_URL ?? "").startsWith("https://") || process.env.VERCEL === "1";
const securePrefix = useSecureCookies ? "__Secure-" : "";

/**
 * next-auth 設定（PF家族共通：メール＋パスワード／Neon の users・companies）。
 * セッションは JWT。companyId 単位でデータをスコープする。
 */
export const authOptions: NextAuthOptions = {
  cookies: {
    sessionToken: {
      name: `${securePrefix}setsubi.session-token`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies },
    },
    callbackUrl: {
      name: `${securePrefix}setsubi.callback-url`,
      options: { sameSite: "lax", path: "/", secure: useSecureCookies },
    },
    csrfToken: {
      // CSRF トークンの既定名は __Host- プレフィックス。他アプリとの衝突回避で名前だけ変える。
      name: `${useSecureCookies ? "__Host-" : ""}setsubi.csrf-token`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies },
    },
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        // フィールド名は互換のため email のまま（中身は社員番号 or 従来のメールアドレス）
        email: { label: "社員番号", type: "text" },
        password: { label: "パスワード", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const sql = getSql();
        const rawId = credentials.email.trim();
        // ポータル一本化: 一般利用者のログインはポータルの一括ログイン（/api/sso）に集約した。
        // パスワードでの直接ログインは、ポータル・SSO障害時の復旧用に統一管理者（admin）だけ許す。
        if (rawId.toLowerCase() !== "admin") {
          throw new Error(
            "ログインはポータルから行ってください。ポータルでログインすると各アプリへ自動でログインされます。"
          );
        }
        let rows;
        try {
          // ① 社員番号（login_id）で検索 → ②ヒットしなければ従来どおりメールアドレスで検索
          rows = await sql`
            SELECT u.id, u.email, u.name, u.password_hash, u.pending,
                   c.id AS company_id, c.name AS company_name, c.is_demo
            FROM users u
            JOIN companies c ON c.id = u.company_id
            WHERE u.login_id = ${rawId}
            LIMIT 1
          `;
          if (rows.length === 0) {
            rows = await sql`
              SELECT u.id, u.email, u.name, u.password_hash, u.pending,
                     c.id AS company_id, c.name AS company_name, c.is_demo
              FROM users u
              JOIN companies c ON c.id = u.company_id
              WHERE u.email = ${rawId.toLowerCase()}
              LIMIT 1
            `;
          }
        } catch {
          // 新規DBで users/companies が未作成の場合などはログイン失敗扱い（登録時に自動作成される）
          return null;
        }
        const user = rows[0];
        if (!user) return null;
        // 招待中（パスワード未設定）はログイン不可。メッセージは signIn の res.error に載る。
        if (user.pending) {
          throw new Error(
            "初回ログインのため、パスワードの設定が必要です。ログイン画面の「初めてログインする方はこちら」からパスワードを設定してください。"
          );
        }
        const valid = await bcrypt.compare(credentials.password, user.password_hash as string);
        if (!valid) return null;
        return {
          id: user.id as string,
          email: (user.email as string | null) ?? "",
          name: user.name as string,
          companyId: user.company_id as string,
          companyName: user.company_name as string,
          isDemo: Boolean(user.is_demo),
        };
      },
    }),
  ],

  session: { strategy: "jwt" },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.companyId = user.companyId;
        token.companyName = user.companyName;
        token.isDemo = user.isDemo;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.companyId = token.companyId as string;
        session.user.companyName = token.companyName as string;
        session.user.isDemo = Boolean(token.isDemo);
      }
      return session;
    },
  },

  pages: { signIn: "/login" },
  secret: process.env.NEXTAUTH_SECRET,
};
