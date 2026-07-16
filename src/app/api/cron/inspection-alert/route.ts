import { NextResponse } from "next/server";
import { getSql } from "@/lib/neon";
import { ensureSchema } from "@/lib/schema";
import { daysUntil, todayJST, alertLeadDays } from "@/lib/inspection";
import { toISODate } from "@/lib/format";
import { getMailer } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "YYYY-MM-DD" → "YYYY/MM/DD"（メール本文用） */
function slashDate(iso: string): string {
  return iso.replaceAll("-", "/");
}

interface DueRow {
  company_id: string;
  company_name: string;
  id: string;
  equipment_name: string;
  management_no: string;
  location: string | null;
  procedure_name: string;
  next_due_date: string;
}

interface ActionRow {
  company_id: string;
  company_name: string;
  title: string;
  assignee: string | null;
  due_date: string;
  equipment_name: string;
  management_no: string;
}

/**
 * 点検期限アラート。クラウドは Vercel Cron、オンプレは compose 内 crond から毎日 GET で叩く。
 * - CRON_SECRET が設定されていれば Authorization: Bearer で認証。
 * - 期限超過 ＋ ALERT_LEAD_DAYS（既定 30/7/1 日前）に該当する設備×手順書の割当と、
 *   期限超過の処置（是正対応）を会社ごとに集計し、その会社のユーザー全員へメール送信。
 * - 休止中・廃止の設備、デモ会社は対象外。処置は超過のみ通知（期限が自由入力のためリード日通知はしない）。
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ message: "unauthorized" }, { status: 401 });
    }
  }

  try {
    await ensureSchema();
  } catch (e) {
    console.error("[cron] schema", e);
    return NextResponse.json({ message: "database not ready" }, { status: 503 });
  }

  const sql = getSql();

  // 古いデモ会社（1日以上前）を清掃（自動削除のバックアップ）
  try {
    await sql`DELETE FROM companies WHERE is_demo = true AND created_at < NOW() - INTERVAL '1 day'`;
  } catch (e) {
    console.error("[cron] demo cleanup", e);
  }

  const today = todayJST();
  const leads = alertLeadDays();
  const maxLead = leads.length ? Math.max(...leads) : 30;
  const boundary = new Date(Date.parse(today + "T00:00:00Z") + maxLead * 86_400_000)
    .toISOString()
    .slice(0, 10);

  // 期限超過 〜 最大リード日 までの割当（設備×手順書）を会社情報付きで取得
  const rows = (await sql`
    SELECT ep.company_id, c.name AS company_name, ep.id,
           e.name AS equipment_name, e.management_no, e.location,
           p.name AS procedure_name, ep.next_due_date
    FROM equipment_procedures ep
    JOIN equipment e ON e.id = ep.equipment_id
    JOIN inspection_procedures p ON p.id = ep.procedure_id
    JOIN companies c ON c.id = ep.company_id
    WHERE ep.next_due_date IS NOT NULL
      AND e.status NOT IN ('retired', 'stopped')
      AND c.is_demo = false
      AND ep.next_due_date <= ${boundary}
    ORDER BY ep.company_id, ep.next_due_date ASC`) as DueRow[];

  // 期限超過の処置（未完了のみ）
  const actionRows = (await sql`
    SELECT ca.company_id, c.name AS company_name, ca.title, ca.assignee, ca.due_date,
           e.name AS equipment_name, e.management_no
    FROM corrective_actions ca
    JOIN equipment e ON e.id = ca.equipment_id
    JOIN companies c ON c.id = ca.company_id
    WHERE ca.status <> 'done'
      AND ca.due_date IS NOT NULL
      AND ca.due_date < ${today}
      AND c.is_demo = false
    ORDER BY ca.company_id, ca.due_date ASC`) as ActionRow[];

  // 会社ごとにまとめ、点検はリード日該当 or 超過のみ残す。
  // 処置超過だけの会社もメール対象になるよう、両方を同じ Map に合流させる。
  const byCompany = new Map<string, { name: string; items: DueRow[]; actions: ActionRow[] }>();
  const entryFor = (companyId: string, name: string) => {
    if (!byCompany.has(companyId)) byCompany.set(companyId, { name, items: [], actions: [] });
    return byCompany.get(companyId)!;
  };
  for (const r of rows) {
    const nd = toISODate(r.next_due_date);
    if (!nd) continue;
    const d = daysUntil(nd, today);
    const hit = d < 0 || leads.includes(d);
    if (!hit) continue;
    entryFor(r.company_id, r.company_name).items.push(r);
  }
  for (const a of actionRows) {
    entryFor(a.company_id, a.company_name).actions.push(a);
  }

  const mailer = getMailer();
  // 差出人: クラウド=ALERT_MAIL_FROM、オンプレ=MAIL_FROM（compose が注入する唯一の差出人設定）
  const from =
    process.env.ALERT_MAIL_FROM ||
    process.env.MAIL_FROM ||
    "PF設備管理 <onboarding@resend.dev>";

  let companiesNotified = 0;
  let mailsSent = 0;
  const skipped: string[] = [];

  for (const [companyId, { name, items, actions }] of byCompany) {
    // email は任意項目（NULL 可）なので未登録ユーザーは宛先から除外
    const userRows = (await sql`SELECT email FROM users WHERE company_id = ${companyId}`) as Array<{
      email: string | null;
    }>;
    const emails = userRows.map((u) => u.email).filter((e): e is string => Boolean(e));
    if (emails.length === 0) continue;

    const sections: string[] = [];
    if (items.length > 0) {
      const lines = items
        .map((it) => {
          const nd = toISODate(it.next_due_date)!;
          const d = daysUntil(nd, today);
          const tag = d < 0 ? `【超過${Math.abs(d)}日】` : `【あと${d}日】`;
          return `${tag} ${it.equipment_name}（${it.management_no}${it.location ? " / " + it.location : ""}） 点検「${it.procedure_name}」 次回 ${slashDate(nd)}`;
        })
        .join("\n");
      sections.push(`■ 点検期限（${items.length}件）\n${lines}`);
    }
    if (actions.length > 0) {
      const lines = actions
        .map((a) => {
          const dd = toISODate(a.due_date)!;
          const d = daysUntil(dd, today);
          return `【超過${Math.abs(d)}日】 ${a.title}（${a.equipment_name} / ${a.management_no}） 担当: ${a.assignee ?? "未定"} 期限 ${slashDate(dd)}`;
        })
        .join("\n");
      sections.push(`■ 期限超過の処置（${actions.length}件）\n${lines}`);
    }

    const total = items.length + actions.length;
    const subject = `【PF設備管理】点検期限のお知らせ（${total}件）`;
    const text = `${name} ご担当者様\n\n以下の対応期限が近づいています（または超過しています）。\n\n${sections.join("\n\n")}\n\n— PF設備管理`;

    if (!mailer) {
      skipped.push(companyId);
      companiesNotified++;
      continue;
    }
    try {
      await mailer.send({ from, to: emails, subject, text });
      mailsSent += emails.length;
      companiesNotified++;
    } catch (e) {
      console.error("[cron] mail send failed", companyId, e);
    }
  }

  return NextResponse.json({
    ok: true,
    today,
    leadDays: leads,
    companiesNotified,
    mailsSent,
    mailSkippedNoKey: !mailer ? skipped.length : 0,
  });
}
