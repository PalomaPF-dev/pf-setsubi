import type { DueLevel, Judgment } from "./types";

/** "YYYY-MM-DD" の文字列に Nか月足した日付を返す（次回点検日の自動計算）。 */
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  // 月末日対応：日付がはみ出たら月末に丸める
  const base = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(d, lastDay));
  return base.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" の文字列に N日足した日付を返す。 */
export function addDays(isoDate: string, days: number): string {
  const t = Date.parse(isoDate + "T00:00:00Z") + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * 基準日と周期から次回点検日を計算。月周期を優先し、どちらも無ければ null（都度点検）。
 */
export function computeNextDueDate(
  baseDate: string | null,
  intervalMonths: number | null,
  intervalDays: number | null
): string | null {
  if (!baseDate) return null;
  if (intervalMonths && intervalMonths > 0) return addMonths(baseDate, intervalMonths);
  if (intervalDays && intervalDays > 0) return addDays(baseDate, intervalDays);
  return null;
}

/** today からの残り日数（負なら超過）。today は "YYYY-MM-DD"。 */
export function daysUntil(targetDate: string, today: string): number {
  const a = Date.parse(targetDate + "T00:00:00Z");
  const b = Date.parse(today + "T00:00:00Z");
  return Math.round((a - b) / 86_400_000);
}

/** 点検期限の緊急度。soonDays（既定30日）以内で「期限間近」。 */
export function dueLevel(
  nextDueDate: string | null,
  today: string,
  soonDays = 30
): DueLevel {
  if (!nextDueDate) return "none";
  const days = daysUntil(nextDueDate, today);
  if (days < 0) return "overdue";
  if (days <= soonDays) return "soon";
  return "ok";
}

/** サーバーのローカル日付を "YYYY-MM-DD"（JST基準）で返す。 */
export function todayJST(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  return jst.toISOString().slice(0, 10);
}

/** ".env の ALERT_LEAD_DAYS"（例 "30,7,1"）を数値配列に。 */
export function alertLeadDays(): number[] {
  const raw = process.env.ALERT_LEAD_DAYS || "30,7,1";
  return raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => b - a);
}

/**
 * 数値のしきい値判定。NULL 側のしきい値は無条件 OK。
 * min ≤ value ≤ max（両端含む）で ok。
 */
export function judgeNumeric(
  value: number,
  min: number | null,
  max: number | null
): Judgment {
  if (min != null && value < min) return "ng";
  if (max != null && value > max) return "ng";
  return "ok";
}

/** 周期の表示ラベル（「3か月ごと」「30日ごと」「都度」）。 */
export function intervalLabel(
  intervalMonths: number | null,
  intervalDays: number | null
): string {
  if (intervalMonths && intervalMonths > 0) return `${intervalMonths}か月ごと`;
  if (intervalDays && intervalDays > 0) return `${intervalDays}日ごと`;
  return "都度";
}
