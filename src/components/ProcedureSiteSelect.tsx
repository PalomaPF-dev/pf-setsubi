import type { Site } from "@/lib/types";

/**
 * 手順書の「作成工場」選択。共通（全工場）か、いずれかの工場を選ぶ。
 *
 * これは閲覧制限ではなく分類のためのラベル。どの工場の手順書でも
 * 全工場から閲覧でき、設備への割当もできる（他工場と共通の点検があるため）。
 * 工場マスタが未登録の会社では何も出さない（選ぶものが無い）。
 */
export default function ProcedureSiteSelect({
  sites,
  defaultSiteId,
  className,
}: {
  sites: Site[];
  /** 初期選択（作成時は作成者の所属工場、編集時は現在の値）。共通は null */
  defaultSiteId?: string | null;
  className?: string;
}) {
  if (sites.length === 0) return null;
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">作成工場</label>
      <select name="siteId" defaultValue={defaultSiteId ?? "shared"} className={className}>
        <option value="shared">共通（全工場）</option>
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-400">
        分類用の表示です。どの工場の手順書でも全工場から閲覧・設備への割当ができます。
      </p>
    </div>
  );
}
