import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getSql } from "@/lib/neon";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * アカウント削除（退会）。認証済み本人のみ。
 * - 自分が会社（組織）唯一のユーザー → 会社ごと削除。
 *   全ドメインテーブルは companies への FK ON DELETE CASCADE なので、
 *   会社行の削除1文で設備・手順書・点検記録・処置・メディア参照まで漏れなく消える（アトミック）。
 *   Blob/ローカルのファイル実体は削除前に URL を収集してベストエフォートで削除する。
 * - 他のユーザーがいる場合 → 自分のユーザー行のみ削除（会社のデータは残す）。
 *   ※このアプリに管理者ロールは無い（全ユーザー同権限）。
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const companyId = session?.user?.companyId;
  if (!userId || !companyId) {
    return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
  }
  if (session.user.isDemo) {
    return NextResponse.json(
      { message: "デモではアカウント削除はできません。" },
      { status: 403 }
    );
  }

  try {
    const sql = getSql();
    // 本人確認（セッションの会社に属するユーザーか）
    const me = await sql`
      SELECT id FROM users WHERE id = ${userId} AND company_id = ${companyId} LIMIT 1`;
    if (me.length === 0) {
      return NextResponse.json({ message: "アカウントが見つかりません。" }, { status: 404 });
    }

    const cnt = await sql`
      SELECT COUNT(*)::int AS n FROM users WHERE company_id = ${companyId}`;
    const userCount = Number(cnt[0]?.n ?? 0);

    if (userCount <= 1) {
      // ---- 会社ごと削除 ----
      // ファイル実体の URL を先に収集（DB は CASCADE で消えるため後からは辿れない）
      let mediaUrls: string[] = [];
      try {
        const results = await Promise.all([
          sql`SELECT blob_url AS url FROM documents WHERE company_id = ${companyId}`,
          sql`SELECT map_image_url AS url FROM sites WHERE company_id = ${companyId} AND map_image_url IS NOT NULL`,
          sql`SELECT diagram_url AS url FROM inspection_procedures WHERE company_id = ${companyId} AND diagram_url IS NOT NULL`,
          sql`SELECT spot_photo_url AS url FROM inspection_items WHERE company_id = ${companyId} AND spot_photo_url IS NOT NULL`,
          sql`SELECT url FROM item_reference_media WHERE company_id = ${companyId}`,
          sql`SELECT url FROM result_media WHERE company_id = ${companyId}`,
          sql`SELECT photo_url AS url FROM inspection_item_results WHERE company_id = ${companyId} AND photo_url IS NOT NULL`,
        ]);
        mediaUrls = results
          .flat()
          .map((r: any) => r.url as string)
          .filter((u) => typeof u === "string" && u.length > 0);
      } catch (e) {
        // URL 収集の失敗で退会を止めない（ファイルが残るだけ。業務データは確実に消す）
        console.error("[account-delete] media url collect failed:", e);
      }

      // CASCADE で users・equipment・inspection_* ほか全テーブルの会社データが一括削除される
      await sql`DELETE FROM companies WHERE id = ${companyId}`;

      try {
        await getStorage().deleteFiles(mediaUrls);
      } catch (e) {
        console.error("[account-delete] file delete failed:", e);
      }
    } else {
      // ---- 自分のユーザーのみ削除（会社・データは残す） ----
      await sql`DELETE FROM users WHERE id = ${userId} AND company_id = ${companyId}`;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[account-delete] error:", err);
    return NextResponse.json(
      { message: "削除に失敗しました。時間をおいて再度お試しください。" },
      { status: 500 }
    );
  }
}
