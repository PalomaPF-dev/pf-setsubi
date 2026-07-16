import { NextResponse } from "next/server";
import { countAdmins, deleteUser } from "@/lib/authDb";
import { getSessionWithRole } from "@/lib/session";
import { getSql } from "@/lib/neon";

export const runtime = "nodejs";

/** 対象ユーザーを自社内で取得（他社ユーザーは対象外＝null）。 */
async function findTarget(id: string, companyId: string): Promise<{ role: "admin" | "member" } | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT role FROM users WHERE id = ${id} AND company_id = ${companyId} LIMIT 1`;
  if (rows.length === 0) return null;
  return { role: rows[0].role as "admin" | "member" };
}

/** メンバー削除（管理者限定）。自分自身・最後の管理者・他社ユーザーは削除不可。 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSessionWithRole();
  if (!s) return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
  if (s.role !== "admin") {
    return NextResponse.json({ message: "権限がありません。" }, { status: 403 });
  }
  if (s.isDemo) {
    return NextResponse.json({ message: "デモでは操作できません。" }, { status: 403 });
  }

  try {
    const { id } = await ctx.params;
    if (id === s.userId) {
      return NextResponse.json(
        { message: "自分自身は削除できません。" },
        { status: 400 }
      );
    }

    const target = await findTarget(id, s.companyId);
    if (!target) {
      return NextResponse.json({ message: "ユーザーが見つかりません。" }, { status: 404 });
    }
    if (target.role === "admin" && (await countAdmins()) <= 1) {
      return NextResponse.json(
        { message: "最後の管理者は削除できません。" },
        { status: 400 }
      );
    }

    await deleteUser(id, s.companyId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[members] delete error:", err);
    return NextResponse.json({ message: "削除に失敗しました。" }, { status: 500 });
  }
}

/**
 * メンバー情報の変更（管理者限定）。role（役割）と factory（所属工場）に対応。
 * - role: 最後の管理者を一般に降格するのは不可。
 * - factory: 空文字/NULL は「全工場」。100文字以内。
 * どちらか一方だけの指定も可（指定されたフィールドのみ更新）。
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSessionWithRole();
  if (!s) return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
  if (s.role !== "admin") {
    return NextResponse.json({ message: "権限がありません。" }, { status: 403 });
  }
  if (s.isDemo) {
    return NextResponse.json({ message: "デモでは操作できません。" }, { status: 403 });
  }

  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    const hasRole = body.role !== undefined;
    const hasFactory = body.factory !== undefined;
    if (!hasRole && !hasFactory) {
      return NextResponse.json({ message: "変更内容が指定されていません。" }, { status: 400 });
    }
    if (hasRole && body.role !== "admin" && body.role !== "member") {
      return NextResponse.json({ message: "役割の指定が正しくありません。" }, { status: 400 });
    }
    const role: "admin" | "member" | null = hasRole ? body.role : null;
    // 所属工場（空欄=全工場）。null も空扱い
    const factory: string | null = hasFactory
      ? (body.factory ?? "").toString().trim() || null
      : null;
    if (hasFactory && factory && factory.length > 100) {
      return NextResponse.json(
        { message: "所属工場は100文字以内で入力してください。" },
        { status: 400 }
      );
    }

    const target = await findTarget(id, s.companyId);
    if (!target) {
      return NextResponse.json({ message: "ユーザーが見つかりません。" }, { status: 404 });
    }

    // 最後の管理者を一般に降格するのは不可（管理者不在を防ぐ）
    if (hasRole && target.role === "admin" && role === "member" && (await countAdmins()) <= 1) {
      return NextResponse.json(
        { message: "最後の管理者は一般に変更できません。" },
        { status: 400 }
      );
    }

    const sql = getSql();
    if (hasRole) {
      await sql`
        UPDATE users SET role = ${role}
        WHERE id = ${id} AND company_id = ${s.companyId}`;
    }
    if (hasFactory) {
      await sql`
        UPDATE users SET factory = ${factory}
        WHERE id = ${id} AND company_id = ${s.companyId}`;
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[members] patch error:", err);
    return NextResponse.json({ message: "変更に失敗しました。" }, { status: 500 });
  }
}
