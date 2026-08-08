import { getSql } from "./neon";
import { ensureSchema } from "./schema";

/**
 * 工場スコープ（ユーザーの所属工場によるデータ表示制限）。
 *
 * ルール:
 * - 管理者（role='admin'）は常に全工場を閲覧できる。
 * - users.factory が NULL（未設定）のユーザー（本部スタッフ等）も全工場を閲覧できる。
 * - それ以外（一般ユーザー ＋ factory 設定あり）は「所属工場のデータのみ」表示。
 *   照合は sites.name と users.factory の名称一致（sites は company 内で名前一意）。
 */
export interface FactoryScope {
  /** 表示制限の対象か（role!=='admin' かつ factory 設定あり） */
  restricted: boolean;
  /** users.factory の値（未設定は null）。制限ユーザーの「所属: ◯◯」表示に使う */
  factoryName: string | null;
  /** 所属工場に名称一致した sites.id。一致する工場が無ければ null（＝何も表示しない） */
  siteId: string | null;
}

/** 無制限スコープ（管理者・factory 未設定ユーザー相当）。 */
export const UNRESTRICTED_SCOPE: FactoryScope = {
  restricted: false,
  factoryName: null,
  siteId: null,
};

/**
 * 所属工場が工場マスタ（sites）に無い制限ユーザー用の「どの行にも一致しない」番兵 UUID。
 * gen_random_uuid() がこの値を生成することは実運用上ない。
 */
const NO_MATCH_SITE_ID = "00000000-0000-0000-0000-000000000000";

/**
 * ログインユーザーの工場スコープを1クエリで解決する。
 * role・factory・（名称一致する）sites.id を同時に取得。
 */
export async function getFactoryScope(
  companyId: string,
  userId: string
): Promise<FactoryScope> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT u.role, u.factory, s.id AS site_id
    FROM users u
    LEFT JOIN sites s ON s.company_id = u.company_id AND s.name = u.factory
    WHERE u.id = ${userId} AND u.company_id = ${companyId}
    LIMIT 1`;
  const r = rows[0];
  if (!r) return UNRESTRICTED_SCOPE;
  const factory = ((r.factory as string | null) ?? "").trim() || null;
  const restricted = r.role !== "admin" && factory != null;
  return {
    restricted,
    factoryName: factory,
    siteId: restricted ? ((r.site_id as string | null) ?? null) : null,
  };
}

/**
 * 一覧クエリ用の工場ID。制限ユーザーは所属工場に固定（リクエスト値は無視）。
 * 所属工場がマスタに無い場合は番兵 UUID を返し、結果を0件にする（全件表示への転落を防ぐ）。
 */
export function scopedSiteId(
  scope: FactoryScope,
  requestedSiteId?: string
): string | undefined {
  if (!scope.restricted) return requestedSiteId;
  return scope.siteId ?? NO_MATCH_SITE_ID;
}

/**
 * 設備（の site_id）がスコープ内か。詳細ページの notFound 判定に使う。
 * 制限ユーザーは「所属工場が解決でき、かつ設備の工場が一致」する場合のみ true
 * （工場未設定の設備は制限ユーザーには見せない＝一覧フィルタと同じ扱い）。
 */
export function isEquipmentSiteVisible(
  scope: FactoryScope,
  equipmentSiteId: string | null | undefined
): boolean {
  if (!scope.restricted) return true;
  return scope.siteId != null && equipmentSiteId === scope.siteId;
}
