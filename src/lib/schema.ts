import { getSql } from "./neon";
import { ensureAuthSchema } from "./authDb";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * DDL を実行するが、「既に存在する」系のエラーは無視する。
 * Postgres の CREATE INDEX/TABLE IF NOT EXISTS は同時実行に対して安全ではなく、
 * 複数リクエストが初回に同時に走ると pg_class のユニーク制約違反(23505/42P07/42710)で
 * 失敗しうる。冪等な初期化として、これらは握り潰す。
 */
async function safeDdl(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (e: any) {
    const code = e?.code ?? e?.sourceError?.code;
    // 42P07: duplicate_table, 42710: duplicate_object, 23505: unique_violation(pg_catalog)
    if (code === "42P07" || code === "42710" || code === "23505") return;
    throw e;
  }
}

let schemaReady: Promise<void> | null = null;

/**
 * 設備管理・点検のドメインテーブルを冪等に作成。
 * - equipment               … 設備台帳（カスタム項目値は custom_values JSONB）
 * - custom_field_defs       … カスタム項目定義（会社単位・ノーコード）
 * - documents               … 添付（設備写真・取説・図面PDF。Vercel Blob の URL を保持）
 * - inspection_procedures   … 点検手順書（テンプレート。記録が参照するためソフト削除）
 * - inspection_items        … 手順書の点検項目（順序付き。同上ソフト削除）
 * - equipment_procedures    … 設備への手順書割当（周期・次回点検日）
 * - inspection_records      … 点検記録（1回の実施）
 * - inspection_item_results … 項目別結果（当時の定義をスナップショット保持）
 *
 * 認証テーブル（companies/users）も同時に用意する。
 * 同一プロセス内の同時呼び出しは1回の実行に集約（共有プロミス）。失敗時は次回再試行できるよう解除。
 */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = buildSchema().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

async function buildSchema(): Promise<void> {
  const sql = getSql();

  await ensureAuthSchema();

  // デモ会社の識別フラグ（使い捨てデモ用・自動清掃の対象）
  await safeDdl(() => sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false`);

  // 利用権（entitlement.ts が参照）用カラム。冪等追加。
  await safeDdl(() => sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_pro BOOLEAN NOT NULL DEFAULT false`);
  await safeDdl(() => sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_store TEXT`);
  await safeDdl(() => sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_product_id TEXT`);
  await safeDdl(() => sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ`);
  await safeDdl(() => sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_updated_at TIMESTAMPTZ`);

  // 管理番号採番ルール（会社ごと。設備なので既定プレフィックスは 'S'）
  await safeDdl(() => sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS management_no_prefix TEXT NOT NULL DEFAULT 'S'`);
  await safeDdl(() => sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS management_no_digits INTEGER NOT NULL DEFAULT 4`);
  await safeDdl(() => sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS management_no_seq INTEGER NOT NULL DEFAULT 1`);

  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS equipment (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      management_no  TEXT NOT NULL,
      name           TEXT NOT NULL,
      category       TEXT,
      maker          TEXT,
      model_no       TEXT,
      serial_no      TEXT,
      location       TEXT,
      status         TEXT NOT NULL DEFAULT 'active',
      installed_date DATE,
      disposal_date  DATE,
      notes          TEXT,
      custom_values  JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, management_no)
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS equipment_company_idx ON equipment(company_id)`);

  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS custom_field_defs (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      field_type TEXT NOT NULL DEFAULT 'text',
      options    JSONB,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, name)
    )`);
  await safeDdl(() => sql`
    CREATE INDEX IF NOT EXISTS custom_field_defs_company_idx
    ON custom_field_defs(company_id, sort_order)`);

  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS documents (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
      doc_type     TEXT NOT NULL DEFAULT 'other',
      title        TEXT NOT NULL,
      blob_url     TEXT NOT NULL,
      file_name    TEXT NOT NULL,
      content_type TEXT,
      size_bytes   BIGINT,
      uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS documents_equipment_idx ON documents(equipment_id)`);

  // 手順書・項目は点検記録から参照されるため物理削除せず archived で運用する
  // （物理削除すると item_id が NULL になり数値推移の系列が消える）。
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS inspection_procedures (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      description TEXT,
      archived    BOOLEAN NOT NULL DEFAULT false,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS procedures_company_idx ON inspection_procedures(company_id)`);

  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS inspection_items (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      procedure_id          UUID NOT NULL REFERENCES inspection_procedures(id) ON DELETE CASCADE,
      sort_order            INTEGER NOT NULL DEFAULT 0,
      label                 TEXT NOT NULL,
      item_type             TEXT NOT NULL DEFAULT 'ok_ng',
      instruction           TEXT,
      unit                  TEXT,
      min_value             NUMERIC,
      max_value             NUMERIC,
      photo_mode            TEXT NOT NULL DEFAULT 'none',
      require_comment_on_ng BOOLEAN NOT NULL DEFAULT false,
      archived              BOOLEAN NOT NULL DEFAULT false,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS items_procedure_idx ON inspection_items(procedure_id, sort_order)`);

  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS equipment_procedures (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      equipment_id        UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
      procedure_id        UUID NOT NULL REFERENCES inspection_procedures(id) ON DELETE CASCADE,
      interval_months     INTEGER,
      interval_days       INTEGER,
      last_inspected_date DATE,
      next_due_date       DATE,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (equipment_id, procedure_id)
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS eq_proc_equipment_idx ON equipment_procedures(equipment_id)`);
  await safeDdl(() => sql`
    CREATE INDEX IF NOT EXISTS eq_proc_company_due_idx
    ON equipment_procedures(company_id, next_due_date)`);

  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS inspection_records (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      equipment_id      UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
      procedure_id      UUID REFERENCES inspection_procedures(id) ON DELETE SET NULL,
      procedure_name    TEXT NOT NULL,
      inspection_date   DATE NOT NULL,
      inspector         TEXT NOT NULL,
      inspector_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      result            TEXT NOT NULL DEFAULT 'pass',
      ng_count          INTEGER NOT NULL DEFAULT 0,
      notes             TEXT,
      client_key        TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await safeDdl(() => sql`ALTER TABLE inspection_records ADD COLUMN IF NOT EXISTS client_key TEXT`);
  await safeDdl(() => sql`
    CREATE INDEX IF NOT EXISTS records_equipment_idx
    ON inspection_records(equipment_id, inspection_date DESC)`);
  await safeDdl(() => sql`
    CREATE INDEX IF NOT EXISTS records_company_idx
    ON inspection_records(company_id, inspection_date DESC)`);
  // 冪等キー（ウィザード再送の二重登録防止）。NULL は対象外の部分ユニーク。
  await safeDdl(() => sql`
    CREATE UNIQUE INDEX IF NOT EXISTS records_client_key_unique
    ON inspection_records(company_id, client_key) WHERE client_key IS NOT NULL`);

  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS inspection_item_results (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      record_id     UUID NOT NULL REFERENCES inspection_records(id) ON DELETE CASCADE,
      item_id       UUID REFERENCES inspection_items(id) ON DELETE SET NULL,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      item_label    TEXT NOT NULL,
      item_type     TEXT NOT NULL,
      judgment      TEXT,
      auto_judgment TEXT,
      value_numeric NUMERIC,
      unit          TEXT,
      min_value     NUMERIC,
      max_value     NUMERIC,
      value_text    TEXT,
      photo_url     TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await safeDdl(() => sql`
    CREATE INDEX IF NOT EXISTS item_results_record_idx
    ON inspection_item_results(record_id, sort_order)`);
  await safeDdl(() => sql`
    CREATE INDEX IF NOT EXISTS item_results_item_idx
    ON inspection_item_results(item_id, created_at)`);

  // 処置（NG項目への是正対応）。記録・項目結果が消えても処置は独立して残す
  // （record_id/item_result_id は SET NULL、項目名は item_label にスナップショット保持）。
  // 設備の完全削除時は処置も一緒に消す（CASCADE）。
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS corrective_actions (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      equipment_id   UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
      record_id      UUID REFERENCES inspection_records(id) ON DELETE SET NULL,
      item_result_id UUID REFERENCES inspection_item_results(id) ON DELETE SET NULL,
      item_label     TEXT,
      title          TEXT NOT NULL,
      detail         TEXT,
      assignee       TEXT,
      due_date       DATE,
      status         TEXT NOT NULL DEFAULT 'open',
      resolved_note  TEXT,
      resolved_at    TIMESTAMPTZ,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await safeDdl(() => sql`
    CREATE INDEX IF NOT EXISTS corrective_actions_company_idx
    ON corrective_actions(company_id, status, due_date ASC NULLS LAST)`);
  await safeDdl(() => sql`
    CREATE INDEX IF NOT EXISTS corrective_actions_equipment_idx
    ON corrective_actions(equipment_id, created_at DESC)`);
  await safeDdl(() => sql`
    CREATE INDEX IF NOT EXISTS corrective_actions_record_idx
    ON corrective_actions(record_id) WHERE record_id IS NOT NULL`);

  // ===== 第3弾: 工場マップ・見本/記録メディア =====

  // 工場（サイト）。map_image_url に見取り図（Blob/local URL）
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS sites (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      map_image_url TEXT,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, name)
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS sites_company_idx ON sites(company_id, sort_order)`);

  // 職場（エリア）。工場削除で CASCADE
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS areas (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      site_id    UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (site_id, name)
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS areas_site_idx ON areas(site_id, sort_order)`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS areas_company_idx ON areas(company_id)`);

  // 設備の配置（工場/職場/マップ上の%座標）
  await safeDdl(() => sql`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL`);
  await safeDdl(() => sql`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES areas(id) ON DELETE SET NULL`);
  await safeDdl(() => sql`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS map_x NUMERIC(6,3)`);
  await safeDdl(() => sql`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS map_y NUMERIC(6,3)`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS equipment_site_idx ON equipment(site_id) WHERE site_id IS NOT NULL`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS equipment_area_idx ON equipment(area_id) WHERE area_id IS NOT NULL`);

  // 点検箇所の写真（項目につき1枚）
  await safeDdl(() => sql`ALTER TABLE inspection_items ADD COLUMN IF NOT EXISTS spot_photo_url TEXT`);

  // 点検部位マップ: 手順書に写真/図面、各項目に図面上のピン座標（% 0-100、未配置は NULL）
  await safeDdl(() => sql`ALTER TABLE inspection_procedures ADD COLUMN IF NOT EXISTS diagram_url TEXT`);
  await safeDdl(() => sql`ALTER TABLE inspection_items ADD COLUMN IF NOT EXISTS map_x NUMERIC(6,3)`);
  await safeDdl(() => sql`ALTER TABLE inspection_items ADD COLUMN IF NOT EXISTS map_y NUMERIC(6,3)`);

  // 手順書項目の「正常な状態の見本」メディア（複数）。項目削除で CASCADE
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS item_reference_media (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      item_id          UUID NOT NULL REFERENCES inspection_items(id) ON DELETE CASCADE,
      media_type       TEXT NOT NULL DEFAULT 'photo',
      url              TEXT NOT NULL,
      content_type     TEXT,
      size_bytes       BIGINT,
      duration_seconds NUMERIC,
      caption          TEXT,
      sort_order       INTEGER NOT NULL DEFAULT 0,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await safeDdl(() => sql`
    CREATE INDEX IF NOT EXISTS item_reference_media_item_idx
    ON item_reference_media(item_id, sort_order)`);
  await safeDdl(() => sql`
    CREATE INDEX IF NOT EXISTS item_reference_media_company_idx
    ON item_reference_media(company_id)`);

  // 点検実施時の項目別メディア（複数。正常・異常どちらも）。項目結果削除で CASCADE
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS result_media (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      item_result_id   UUID NOT NULL REFERENCES inspection_item_results(id) ON DELETE CASCADE,
      media_type       TEXT NOT NULL DEFAULT 'photo',
      url              TEXT NOT NULL,
      content_type     TEXT,
      size_bytes       BIGINT,
      duration_seconds NUMERIC,
      note             TEXT,
      sort_order       INTEGER NOT NULL DEFAULT 0,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await safeDdl(() => sql`
    CREATE INDEX IF NOT EXISTS result_media_result_idx
    ON result_media(item_result_id, sort_order)`);
  await safeDdl(() => sql`
    CREATE INDEX IF NOT EXISTS result_media_company_idx
    ON result_media(company_id)`);

  // ===== 点検承認ワークフロー（第4弾 2026-07-04） =====
  // 記録の承認ステート: pending 承認待ち / approved 承認済み / returned 差し戻し。
  // 既存・過去の記録は DEFAULT 'approved' で承認済み扱い（遡及承認は不要）。
  // 新規の点検実施は createInspectionRecord が明示的に 'pending' を入れる。
  await safeDdl(() => sql`ALTER TABLE inspection_records ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'`);
  await safeDdl(() => sql`ALTER TABLE inspection_records ADD COLUMN IF NOT EXISTS approver_user_id UUID REFERENCES users(id) ON DELETE SET NULL`);
  await safeDdl(() => sql`ALTER TABLE inspection_records ADD COLUMN IF NOT EXISTS approver_name TEXT`);
  await safeDdl(() => sql`ALTER TABLE inspection_records ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`);
  await safeDdl(() => sql`ALTER TABLE inspection_records ADD COLUMN IF NOT EXISTS review_comment TEXT`);
  await safeDdl(() => sql`ALTER TABLE inspection_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await safeDdl(() => sql`
    CREATE INDEX IF NOT EXISTS records_company_approval_idx
    ON inspection_records(company_id, approval_status, inspection_date DESC)`);

  // 会社設定: 承認者メール（点検完了→承認依頼の宛先）＋作業者名簿（点検開始時に選択）
  await safeDdl(() => sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS approver_email TEXT`);
  await safeDdl(() => sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS worker_roster JSONB NOT NULL DEFAULT '[]'::jsonb`);
}
