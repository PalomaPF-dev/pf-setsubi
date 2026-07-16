/**
 * string | Date を "YYYY-MM-DD" に正規化。
 * pg ドライバが返す DATE（ローカル深夜の Date）は toISOString(UTC) だと前日にずれるため、
 * Date はローカルの暦日要素から組み立てる。
 */
export function toISODate(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())}`;
  }
  return String(value).slice(0, 10);
}

/** "YYYY-MM-DD"（または ISO 文字列 / Date）を "2026年6月27日" 表記に。 */
export function formatDate(value: string | Date | null | undefined): string {
  const iso = toISODate(value);
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return String(value);
  return `${y}年${Number(m)}月${Number(d)}日`;
}

/** ISO 日時を "2026年7月6日 9:30" 表記に（formatDate と同じ和暦なし年月日形式で統一）。 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const dt = new Date(value);
  if (isNaN(dt.getTime())) return value;
  const jst = new Date(dt.getTime() + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日 ${jst.getUTCHours()}:${p(jst.getUTCMinutes())}`;
}

/** バイト数を人間可読に。 */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
