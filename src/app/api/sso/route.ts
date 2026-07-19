import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { encode } from "next-auth/jwt";
import { authOptions } from "@/lib/authOptions";
import { getSql } from "@/lib/neon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ポータルからのSSOログインAPI。
 * ポータルは PF_PROVISION_KEY で署名した短命トークン（60秒）を付けてリダイレクトしてくる。
 * トークン検証に成功したら、Credentials ログインと同じ内容の next-auth セッション JWT を
 * 発行してクッキーにセットし、トップへリダイレクトする（パスワード不要）。
 * pending（パスワード未設定）ユーザーもポータル経由ならログイン可能とする。
 */

// このアプリのキー（トークンの app と一致必須）
const APP_KEY = "setsubi";
// セッション寿命は next-auth の既定（30日）に合わせる
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

/** 検証失敗時は理由を漏らさずログイン画面へ（詳細はサーバーログのみ） */
function ssoFail(req: NextRequest): NextResponse {
  return NextResponse.redirect(new URL("/login?error=sso", req.nextUrl), 302);
}

/** タイミング安全な比較（長さ違いは即 false 扱い） */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function GET(req: NextRequest) {
  const provisionKey = process.env.PF_PROVISION_KEY;
  if (!provisionKey) {
    return NextResponse.json({ message: "SSO未設定" }, { status: 503 });
  }

  const raw = req.nextUrl.searchParams.get("token") ?? "";
  const dot = raw.lastIndexOf(".");
  if (dot <= 0 || dot === raw.length - 1) return ssoFail(req);
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);

  // 署名検証（payload 文字列に対する HMAC-SHA256 の小文字hex）
  const expected = createHmac("sha256", provisionKey).update(payload).digest("hex");
  if (!safeEqual(sig, expected)) return ssoFail(req);

  // ペイロード検証（loginId / app / exp。exp は epoch ms、発行から60秒有効）
  let data: { loginId?: unknown; app?: unknown; exp?: unknown };
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return ssoFail(req);
  }
  const loginId = typeof data.loginId === "string" ? data.loginId.trim() : "";
  if (!loginId) return ssoFail(req);
  if (data.app !== APP_KEY) return ssoFail(req);
  if (typeof data.exp !== "number" || !(data.exp > Date.now())) return ssoFail(req);

  try {
    // 社員番号（login_id）でユーザー特定。pending でもログイン可（パスワードは触らない）。
    const sql = getSql();
    const rows = await sql`
      SELECT u.id, u.email, u.name,
             c.id AS company_id, c.name AS company_name, c.is_demo
      FROM users u
      JOIN companies c ON c.id = u.company_id
      WHERE u.login_id = ${loginId}
      LIMIT 1
    `;
    const user = rows[0];
    if (!user) return ssoFail(req);

    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) return ssoFail(req);

    // authorize → jwt コールバック通過後と同一のトークンを組み立てる
    // （既定コールバックが sub/name/email を、authOptions.callbacks.jwt が
    //   id/companyId/companyName/isDemo を載せる）。
    const sessionToken = await encode({
      token: {
        sub: user.id as string,
        name: user.name as string,
        email: (user.email as string | null) ?? "",
        id: user.id as string,
        companyId: user.company_id as string,
        companyName: user.company_name as string,
        isDemo: Boolean(user.is_demo),
      },
      secret,
      maxAge: SESSION_MAX_AGE,
    });

    // クッキー名・属性は authOptions と同一（アプリ固有名／https 時は __Secure- 接頭辞）
    const cookie = authOptions.cookies!.sessionToken!;
    const res = NextResponse.redirect(new URL("/", req.nextUrl), 302);
    res.cookies.set(cookie.name!, sessionToken, {
      ...cookie.options,
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  } catch (err) {
    console.error("[sso] error:", err);
    return ssoFail(req);
  }
}
