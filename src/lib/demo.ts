import bcrypt from "bcryptjs";
import { getSql } from "./neon";
import { ensureSchema } from "./schema";
import { todayJST } from "./inspection";

/** デモ用ログインの固定パスワード（誰でも体験できる前提なので公開で問題ない）。 */
export const DEMO_PASSWORD = "demo-2026";

/** 固定パスワードのハッシュはコールドスタート時に1回だけ計算（リクエスト毎の bcrypt を回避）。 */
const DEMO_PASSWORD_HASH = bcrypt.hashSync(DEMO_PASSWORD, 10);

/** 同時に保持するデモ会社の上限（作成レートに連動した即時上限）。 */
const MAX_DEMO_COMPANIES = 30;

/** "YYYY-MM-DD" に日数を加算（負で過去）。 */
function plusDays(isoDate: string, days: number): string {
  const d = new Date(Date.parse(isoDate + "T00:00:00Z") + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 使い捨てデモのセッションを用意する。
 * - 3時間以上前の古いデモ会社を清掃
 * - is_demo=true のデモ会社＋デモユーザー＋サンプル設備・手順書・点検履歴一式を新規作成
 * - 返した email / password でクライアントがそのままサインインする
 * 実アカウント・本番データには一切影響しない。
 */
export async function createDemoSession(): Promise<{ email: string; password: string }> {
  await ensureSchema();
  const sql = getSql();

  // 古いデモを掃除（CASCADE で関連も削除）
  await sql`DELETE FROM companies WHERE is_demo = true AND created_at < NOW() - INTERVAL '3 hours'`;

  const companyRows = await sql`
    INSERT INTO companies (name, is_demo) VALUES (${"（デモ）PF製作所"}, true) RETURNING id`;
  const companyId = companyRows[0].id as string;

  // 件数上限：最新 MAX_DEMO_COMPANIES 社だけ残し、古いデモは削除（連打蓄積を即時に抑制）
  await sql`
    DELETE FROM companies WHERE is_demo = true AND id NOT IN (
      SELECT id FROM companies WHERE is_demo = true ORDER BY created_at DESC LIMIT ${MAX_DEMO_COMPANIES}
    )`;

  // メールはフルUUIDで一意（衝突回避＋列挙耐性）。パスワードは事前計算ハッシュ。
  const email = `demo-${companyId}@demo.local`;
  // role は必ず 'member'（デモユーザーに管理者権限を与えない）
  const userRows = await sql`
    INSERT INTO users (company_id, email, name, password_hash, role)
    VALUES (${companyId}, ${email}, ${"デモ太郎"}, ${DEMO_PASSWORD_HASH}, ${"member"})
    RETURNING id`;

  await seedSampleData(sql, companyId, userRows[0].id as string);

  return { email, password: DEMO_PASSWORD };
}

/**
 * サンプル設備・カスタム項目・手順書・割当・点検履歴を投入。
 * 点検期限はサインイン日基準で OK/間近/超過が混在し、数値推移グラフが描けるよう
 * コンプレッサの圧力値を数か月分入れる。
 *
 * 使い捨てデモ（createDemoSession）専用。実データの会社には決して投入しない。
 * userId は点検記録の実施者・承認者IDに入れるだけなので null 可。
 */
async function seedSampleData(
  sql: any,
  companyId: string,
  userId: string | null
): Promise<void> {
  const today = todayJST();

  // 承認ワークフローのデモ設定（承認者メール・作業者名簿）。デモ会社はメール送信対象外。
  await sql`
    UPDATE companies SET
      approver_email = ${"kanri@example.com"},
      worker_roster = ${JSON.stringify(["山田 太郎", "佐藤 花子", "鈴木 一郎"])}::jsonb
    WHERE id = ${companyId}`;

  // カスタム項目定義
  const cfRows = await sql`
    INSERT INTO custom_field_defs (company_id, name, field_type, options, sort_order) VALUES
      (${companyId}, ${"資産番号"}, 'text', NULL, 0),
      (${companyId}, ${"設置年度"}, 'number', NULL, 1),
      (${companyId}, ${"重要度"}, 'select', ${JSON.stringify(["A", "B", "C"])}::jsonb, 2)
    RETURNING id, name`;
  const cfId: Record<string, string> = {};
  for (const r of cfRows) cfId[r.name as string] = r.id as string;

  // 設備
  const items: Array<{
    no: string; name: string; category: string; maker: string; model: string;
    serial: string; location: string; status: string; installed: string;
    custom: Record<string, string>;
  }> = [
    { no: "S-0001", name: "スクリューコンプレッサ 22kW", category: "コンプレッサ", maker: "日立産機", model: "OSP-22M6", serial: "SN-2001", location: "機械室", status: "active", installed: plusDays(today, -1500), custom: { 資産番号: "A-1001", 設置年度: "2021", 重要度: "A" } },
    { no: "S-0002", name: "NC旋盤", category: "工作機械", maker: "オークマ", model: "LB3000EX", serial: "SN-2002", location: "第1ライン", status: "active", installed: plusDays(today, -2200), custom: { 資産番号: "A-1002", 設置年度: "2019", 重要度: "A" } },
    { no: "S-0003", name: "マシニングセンタ", category: "工作機械", maker: "DMG森精機", model: "CMX-1100V", serial: "SN-2003", location: "第2ライン", status: "active", installed: plusDays(today, -900), custom: { 資産番号: "A-1003", 設置年度: "2023", 重要度: "B" } },
    { no: "S-0004", name: "半自動溶接機", category: "溶接機", maker: "ダイヘン", model: "DM-350", serial: "SN-2004", location: "溶接工程", status: "repair", installed: plusDays(today, -1800), custom: { 資産番号: "A-1004", 設置年度: "2020", 重要度: "B" } },
    { no: "S-0005", name: "集塵機", category: "環境設備", maker: "アマノ", model: "VNA-45", serial: "SN-2005", location: "研磨工程", status: "active", installed: plusDays(today, -1100), custom: { 資産番号: "A-1005", 設置年度: "2022", 重要度: "C" } },
    { no: "S-0006", name: "旧型プレス機", category: "プレス機", maker: "アイダ", model: "NC1-80", serial: "SN-2006", location: "倉庫", status: "retired", installed: plusDays(today, -4000), custom: { 資産番号: "A-0901", 設置年度: "2014", 重要度: "C" } },
  ];

  const eqId: Record<string, string> = {};
  for (const it of items) {
    const customValues: Record<string, string> = {};
    for (const [name, v] of Object.entries(it.custom)) {
      if (cfId[name]) customValues[cfId[name]] = v;
    }
    const rows = await sql`
      INSERT INTO equipment (
        company_id, management_no, name, category, maker, model_no, serial_no,
        location, status, installed_date, disposal_date, notes, custom_values
      ) VALUES (
        ${companyId}, ${it.no}, ${it.name}, ${it.category}, ${it.maker}, ${it.model}, ${it.serial},
        ${it.location}, ${it.status}, ${it.installed},
        ${it.status === "retired" ? plusDays(today, -60) : null}, ${null},
        ${JSON.stringify(customValues)}::jsonb
      ) RETURNING id`;
    eqId[it.no] = rows[0].id as string;
  }

  // 工場・職場（工場/職場フィルタ・台帳CSVの「工場」「職場」列・マップのピン座標のデモ用。
  // マップ画像はシードしない＝Blobリーク回避。画像なしでもピン座標は保存できる）
  const siteRows = await sql`
    INSERT INTO sites (company_id, name, sort_order)
    VALUES (${companyId}, ${"本社工場"}, 0)
    RETURNING id`;
  const siteId = siteRows[0].id as string;
  const areaRows = await sql`
    INSERT INTO areas (company_id, site_id, name, sort_order) VALUES
      (${companyId}, ${siteId}, ${"第1ライン"}, 0),
      (${companyId}, ${siteId}, ${"組立"}, 1)
    RETURNING id, name`;
  const areaId: Record<string, string> = {};
  for (const r of areaRows) areaId[r.name as string] = r.id as string;

  await sql`
    UPDATE equipment
    SET site_id = ${siteId}, area_id = ${areaId["第1ライン"]}, map_x = ${25.5}, map_y = ${40.2}
    WHERE id = ${eqId["S-0001"]}`;
  await sql`
    UPDATE equipment
    SET site_id = ${siteId}, area_id = ${areaId["第1ライン"]}, map_x = ${62.0}, map_y = ${55.8}
    WHERE id = ${eqId["S-0002"]}`;
  await sql`
    UPDATE equipment
    SET site_id = ${siteId}, area_id = ${areaId["組立"]}
    WHERE id = ${eqId["S-0003"]}`;

  // 手順書1: コンプレッサ日常点検（4項目）
  const proc1Rows = await sql`
    INSERT INTO inspection_procedures (company_id, name, description)
    VALUES (${companyId}, ${"コンプレッサ日常点検"}, ${"始業前に実施する日常点検。異常時は保全担当へ連絡。"})
    RETURNING id`;
  const proc1 = proc1Rows[0].id as string;
  const p1Items = await sql`
    INSERT INTO inspection_items (
      company_id, procedure_id, sort_order, label, item_type, instruction,
      unit, min_value, max_value, photo_mode, require_comment_on_ng
    ) VALUES
      (${companyId}, ${proc1}, 0, ${"異音・異臭がないか"}, 'ok_ng', ${"運転音を確認。普段と違う音がしたら NG。"}, NULL, NULL, NULL, 'none', true),
      (${companyId}, ${proc1}, 1, ${"吐出圧力"}, 'numeric', ${"運転中の圧力計を読み取る。"}, ${"MPa"}, ${0.6}, ${0.9}, 'optional', false),
      (${companyId}, ${proc1}, 2, ${"ドレン排出"}, 'ok_ng', ${"ドレンバルブを開けて水分を排出。"}, NULL, NULL, NULL, 'none', false),
      (${companyId}, ${proc1}, 3, ${"圧力計の写真"}, 'photo', ${"圧力計全体が写るように撮影。"}, NULL, NULL, NULL, 'required', false)
    RETURNING id, sort_order`;
  const p1 = [...p1Items].sort((a: any, b: any) => a.sort_order - b.sort_order).map((r: any) => r.id as string);

  // 手順書2: 月次設備点検（3項目）
  const proc2Rows = await sql`
    INSERT INTO inspection_procedures (company_id, name, description)
    VALUES (${companyId}, ${"月次設備点検"}, ${"毎月の定期点検。給油・清掃状態を中心に確認。"})
    RETURNING id`;
  const proc2 = proc2Rows[0].id as string;
  await sql`
    INSERT INTO inspection_items (
      company_id, procedure_id, sort_order, label, item_type, instruction,
      unit, min_value, max_value, photo_mode, require_comment_on_ng
    ) VALUES
      (${companyId}, ${proc2}, 0, ${"給油状態"}, 'ok_ng', ${"オイルゲージの油面を確認。"}, NULL, NULL, NULL, 'none', false),
      (${companyId}, ${proc2}, 1, ${"清掃状態・周辺整理"}, 'ok_ng', NULL, NULL, NULL, NULL, 'optional', false),
      (${companyId}, ${proc2}, 2, ${"気付き事項"}, 'text', ${"次回への申し送りがあれば記入。"}, NULL, NULL, NULL, 'none', false)`;

  // 割当: 期限 OK/間近/超過 が混在するように
  const assign = async (eqNo: string, procId: string, months: number | null, days: number | null, last: string | null, next: string | null) => {
    const rows = await sql`
      INSERT INTO equipment_procedures (
        company_id, equipment_id, procedure_id, interval_months, interval_days,
        last_inspected_date, next_due_date
      ) VALUES (${companyId}, ${eqId[eqNo]}, ${procId}, ${months}, ${days}, ${last}, ${next})
      RETURNING id`;
    return rows[0].id as string;
  };
  await assign("S-0001", proc1, null, 7, plusDays(today, -2), plusDays(today, 5)); // 週次・もうすぐ
  await assign("S-0001", proc2, 1, null, plusDays(today, -40), plusDays(today, -10)); // 超過
  await assign("S-0002", proc2, 1, null, plusDays(today, -20), plusDays(today, 10)); // 間近
  await assign("S-0003", proc2, 3, null, plusDays(today, -30), plusDays(today, 60)); // 余裕
  await assign("S-0005", proc2, 1, null, null, plusDays(today, -3)); // 超過（未実施）

  // 点検履歴: コンプレッサ日常点検 ×4回（圧力の推移が見えるように）＋ 直近1回は NG。
  // 承認ワークフローの3状態を demo で見せる: 古い2件=承認済み / 1件=差し戻し / 直近=承認待ち。
  const history: Array<{
    daysAgo: number;
    pressure: number;
    noise: "ok" | "ng";
    note: string | null;
    worker: string;
    approval: "approved" | "returned" | "pending";
    reviewComment: string | null;
  }> = [
    { daysAgo: 23, pressure: 0.72, noise: "ok", note: null, worker: "山田 太郎", approval: "approved", reviewComment: null },
    { daysAgo: 16, pressure: 0.75, noise: "ok", note: null, worker: "佐藤 花子", approval: "approved", reviewComment: null },
    { daysAgo: 9, pressure: 0.82, noise: "ok", note: null, worker: "鈴木 一郎", approval: "returned", reviewComment: "圧力計の写真がぶれています。撮り直して再提出してください。" },
    { daysAgo: 2, pressure: 0.93, noise: "ng", note: "吐出圧力が基準値超過。ベルトから異音あり。保全担当へ連絡済み。", worker: "山田 太郎", approval: "pending", reviewComment: null },
  ];
  for (const h of history) {
    const date = plusDays(today, -h.daysAgo);
    // 実施時刻（created_at）は実施日と同じ日の 9:30 JST に揃える
    // （既定の NOW() だと「実施日=数日前・実施時刻=今日」とズレて見えるため明示的に入れる）
    const createdAt = `${date}T00:30:00Z`; // 9:30 JST
    const approvedAt = `${date}T01:00:00Z`; // 10:00 JST
    const overPressure = h.pressure > 0.9;
    const ngCount = (overPressure ? 1 : 0) + (h.noise === "ng" ? 1 : 0);
    const approverName = h.approval === "pending" ? null : "デモ太郎";
    const recRows = await sql`
      INSERT INTO inspection_records (
        company_id, equipment_id, procedure_id, procedure_name, inspection_date,
        inspector, inspector_user_id, result, ng_count, notes,
        approval_status, approver_name, approver_user_id, approved_at, review_comment,
        created_at
      ) VALUES (
        ${companyId}, ${eqId["S-0001"]}, ${proc1}, ${"コンプレッサ日常点検"}, ${date},
        ${h.worker}, ${userId}, ${ngCount > 0 ? "fail" : "pass"}, ${ngCount}, ${h.note},
        ${h.approval}, ${approverName}, ${h.approval === "pending" ? null : userId},
        ${h.approval === "approved" ? approvedAt : null}, ${h.reviewComment},
        ${createdAt}
      ) RETURNING id`;
    const recId = recRows[0].id as string;
    const pJudge = overPressure ? "ng" : "ok";
    await sql`
      INSERT INTO inspection_item_results (
        company_id, record_id, item_id, sort_order, item_label, item_type,
        judgment, auto_judgment, value_numeric, unit, min_value, max_value, value_text, photo_url
      ) VALUES
        (${companyId}, ${recId}, ${p1[0]}, 0, ${"異音・異臭がないか"}, 'ok_ng',
         ${h.noise}, NULL, NULL, NULL, NULL, NULL,
         ${h.noise === "ng" ? "モーター付近からベルト鳴きのような音" : null}, NULL),
        (${companyId}, ${recId}, ${p1[1]}, 1, ${"吐出圧力"}, 'numeric',
         ${pJudge}, ${pJudge}, ${h.pressure}, ${"MPa"}, ${0.6}, ${0.9}, NULL, NULL),
        (${companyId}, ${recId}, ${p1[2]}, 2, ${"ドレン排出"}, 'ok_ng',
         'ok', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
        (${companyId}, ${recId}, ${p1[3]}, 3, ${"圧力計の写真"}, 'photo',
         NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`;
  }
}
