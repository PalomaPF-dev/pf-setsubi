import crypto from "crypto";
import bcrypt from "bcryptjs";
import { getSql } from "./neon";

/**
 * ユーザーの役割（ポータルの3段階権限）。
 * - admin: 管理者（マスタ設定・承認・メンバー管理）
 * - member: 一般（記録＋閲覧。作業者の代理入力可）
 * - worker: 作業者（本人がログインして記録。記録者名は本人で固定）
 */
export type UserRole = "admin" | "member" | "worker";

/** 認証用テーブル（companies/users）を冪等に作成。空DBでも自動初期化されるようにする。 */
export async function ensureAuthSchema(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS companies (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS users_company_id_idx ON users(company_id)`;
  // 社内向け「管理者がアカウントを発行する」モデル用の列（冪等追加）。
  // role='admin' はメンバー管理・初期セットアップ権限、pending=true は招待メール送信済み・パスワード未設定。
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS pending BOOLEAN NOT NULL DEFAULT false`;
  // 社員番号ログイン用の login_id 列（冪等追加）。メールアドレスは任意項目に変更（NOT NULL 解除）。
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS login_id TEXT`;
  // 所属工場（sites.name と名称一致で照合）。NULL = 全工場閲覧可（本部スタッフ等）。
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS factory TEXT`;
  // 指名承認者（承認者の login_id）。NULL = 指名なし（全管理者が承認可能）。
  // ポータル provision v2 が設定する。点検承認のルーティングとメール宛先に使う。
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS approver_login_id TEXT`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_login_id_idx ON users(login_id)`;
  await sql`ALTER TABLE users ALTER COLUMN email DROP NOT NULL`;
  // バックフィル①: 統一管理者ID 'admin'。未使用のときだけ最古の管理者1名に付与
  // （管理者が複数いても一意インデックスに抵触しないように1名だけ）。
  await sql`
    UPDATE users SET login_id = 'admin'
    WHERE id = (
      SELECT id FROM users
      WHERE role = 'admin' AND login_id IS NULL
      ORDER BY created_at ASC LIMIT 1
    )
    AND NOT EXISTS (SELECT 1 FROM users WHERE login_id = 'admin')`;
  // バックフィル②: 既存ユーザーは従来のメール文字列をそのまま社員番号としてログイン可能に。
  await sql`UPDATE users SET login_id = email WHERE login_id IS NULL AND email IS NOT NULL`;
  // 統一管理者ブートストラップ（env があるときだけ・冪等）。
  await bootstrapUnifiedAdmin(sql);
}

// 統一管理者ブートストラップの固定値（PF社内展開・全アプリ共通）
const BOOTSTRAP_ADMIN_LOGIN_ID = "admin";
const BOOTSTRAP_COMPANY_NAME = "株式会社パロマ";
const BOOTSTRAP_ADMIN_NAME = "管理者";
const BOOTSTRAP_ADMIN_EMAIL: string | null = null; // 社内運用: 管理者はメール無し（社員番号 admin でログイン）

/**
 * 統一管理者（login_id='admin'）のブートストラップ。
 * - PF_ADMIN_BOOTSTRAP_HASH（bcryptハッシュをそのまま）を設定した環境でのみ動作。
 * - login_id='admin' のユーザーが既に存在すれば何もしない（冪等）。
 * - 会社「株式会社パロマ」が無ければ作成してから管理者を INSERT する。
 * - 失敗しても throw しない（ensureAuthSchema 呼び出し元の通常処理を止めない）。
 */
/**
 * 実運用の会社「株式会社パロマ」を名前で get-or-create して id を返す。
 * 既存があれば必ず再利用する（同名が複数あっても最古の1社に寄せる）。
 * 統一管理者の所属先。
 */
async function getOrCreateBootstrapCompany(sql: ReturnType<typeof getSql>): Promise<string> {
  const companies = await sql`
    SELECT id FROM companies WHERE name = ${BOOTSTRAP_COMPANY_NAME}
    ORDER BY created_at ASC LIMIT 1`;
  const existing = companies[0]?.id as string | undefined;
  if (existing) return existing;
  const created = await sql`
    INSERT INTO companies (name) VALUES (${BOOTSTRAP_COMPANY_NAME}) RETURNING id`;
  return created[0].id as string;
}

async function bootstrapUnifiedAdmin(sql: ReturnType<typeof getSql>): Promise<void> {
  const hash = (process.env.PF_ADMIN_BOOTSTRAP_HASH ?? "").trim();
  if (!hash) return;
  try {
    const exists = await sql`SELECT 1 FROM users WHERE login_id = ${BOOTSTRAP_ADMIN_LOGIN_ID} LIMIT 1`;
    if (exists.length > 0) return;

    const companyId = await getOrCreateBootstrapCompany(sql);

    // email/login_id の一意制約に競合したら何もしない（同時実行・別経路作成済みでも安全）
    await sql`
      INSERT INTO users (company_id, login_id, email, name, password_hash, role, pending)
      VALUES (${companyId}, ${BOOTSTRAP_ADMIN_LOGIN_ID}, ${BOOTSTRAP_ADMIN_EMAIL},
              ${BOOTSTRAP_ADMIN_NAME}, ${hash}, 'admin', false)
      ON CONFLICT DO NOTHING`;
  } catch (e) {
    console.warn("[auth] unified admin bootstrap failed (continuing):", (e as Error).message);
  }
}

/** メール重複チェック */
export async function emailExists(email: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`SELECT 1 FROM users WHERE email = ${email} LIMIT 1`;
  return rows.length > 0;
}

/** 社員番号（login_id）重複チェック */
export async function loginIdExists(loginId: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`SELECT 1 FROM users WHERE login_id = ${loginId} LIMIT 1`;
  return rows.length > 0;
}

/** 会社を作成し ID を返す */
export async function createCompany(name: string): Promise<string> {
  const sql = getSql();
  const rows = await sql`INSERT INTO companies (name) VALUES (${name}) RETURNING id`;
  return rows[0].id as string;
}

/**
 * 会社名で会社を取得し、無ければ作成して ID を返す（get-or-create）。
 * 統一管理者ブートストラップと同じ方法（最古の同名会社を採用）。ポータル一括発行(provision)用。
 */
export async function getOrCreateCompanyByName(name: string): Promise<string> {
  const sql = getSql();
  const rows = await sql`
    SELECT id FROM companies WHERE name = ${name}
    ORDER BY created_at ASC LIMIT 1`;
  const existing = rows[0]?.id as string | undefined;
  if (existing) return existing;
  const created = await sql`INSERT INTO companies (name) VALUES (${name}) RETURNING id`;
  return created[0].id as string;
}

/** ユーザーを作成（パスワードは bcrypt でハッシュ化）。作成したユーザーIDを返す。 */
export async function createUser(
  companyId: string,
  email: string | null,
  name: string,
  password: string,
  role: UserRole = "member",
  loginId: string | null = null
): Promise<string> {
  const sql = getSql();
  const passwordHash = await bcrypt.hash(password, 12);
  const rows = await sql`
    INSERT INTO users (company_id, login_id, email, name, password_hash, role)
    VALUES (${companyId}, ${loginId}, ${email}, ${name}, ${passwordHash}, ${role})
    RETURNING id
  `;
  return rows[0].id as string;
}

/**
 * 招待ユーザーを作成（pending=true）。ログインできないランダムなハッシュを設定し、
 * パスワードは招待リンク（/password-reset/confirm）から本人が設定する。作成したIDを返す。
 */
export async function createInvitedUser(
  companyId: string,
  loginId: string,
  email: string | null,
  name: string,
  role: UserRole,
  factory: string | null = null,
  approverLoginId: string | null = null
): Promise<string> {
  const sql = getSql();
  // ランダムな使えないパスワード（招待完了までログイン不可）
  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 12);
  const rows = await sql`
    INSERT INTO users (company_id, login_id, email, name, password_hash, role, pending, factory, approver_login_id)
    VALUES (${companyId}, ${loginId}, ${email}, ${name}, ${passwordHash}, ${role}, true, ${factory}, ${approverLoginId})
    RETURNING id
  `;
  return rows[0].id as string;
}

/** 自社ユーザー一覧（メンバー管理用）。作成順。 */
export async function listCompanyUsers(companyId: string): Promise<
  {
    id: string;
    loginId: string | null;
    email: string | null;
    name: string;
    role: UserRole;
    pending: boolean;
    factory: string | null;
    createdAt: string;
  }[]
> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, login_id, email, name, role, pending, factory, created_at
    FROM users
    WHERE company_id = ${companyId}
    ORDER BY created_at ASC`;
  return rows.map((r) => ({
    id: r.id as string,
    loginId: (r.login_id as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    name: r.name as string,
    role: r.role as UserRole,
    pending: Boolean(r.pending),
    factory: (r.factory as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

/** ユーザーの役割を取得（存在しなければ null）。 */
export async function getUserRole(userId: string): Promise<UserRole | null> {
  const sql = getSql();
  const rows = await sql`SELECT role FROM users WHERE id = ${userId} LIMIT 1`;
  if (rows.length === 0) return null;
  return rows[0].role as UserRole;
}

/**
 * ユーザーの役割＋所属工場を1クエリで取得（存在しなければ null）。
 * role と同様、DB から都度取得する（JWT には載せない＝管理者の変更が即時反映される）。
 */
export async function getUserRoleAndFactory(
  userId: string
): Promise<{ role: UserRole; factory: string | null } | null> {
  const sql = getSql();
  const rows = await sql`SELECT role, factory FROM users WHERE id = ${userId} LIMIT 1`;
  if (rows.length === 0) return null;
  return {
    role: rows[0].role as UserRole,
    factory: (rows[0].factory as string | null) ?? null,
  };
}

/**
 * 点検承認ルーティング用: ユーザーの role と login_id を取得（存在しなければ null）。
 * 管理者が承認待ち一覧・承認操作を行うとき、自分宛て（提出者の approver_login_id が
 * NULL または自分の login_id）の記録だけを対象にするために使う。
 */
export async function getUserApprovalRouting(
  userId: string
): Promise<{ role: UserRole; loginId: string | null } | null> {
  const sql = getSql();
  const rows = await sql`SELECT role, login_id FROM users WHERE id = ${userId} LIMIT 1`;
  if (rows.length === 0) return null;
  return {
    role: rows[0].role as UserRole,
    loginId: (rows[0].login_id as string | null) ?? null,
  };
}

/** 全体の管理者（role='admin'）の数。初期セットアップ判定・最後の管理者ガードに使う。 */
export async function countAdmins(): Promise<number> {
  const sql = getSql();
  const rows = await sql`SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin'`;
  return Number(rows[0]?.n ?? 0);
}

/** ユーザーを削除（company_id 一致のもののみ＝他社ユーザーは対象外）。 */
export async function deleteUser(userId: string, companyId: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM users WHERE id = ${userId} AND company_id = ${companyId}`;
}
