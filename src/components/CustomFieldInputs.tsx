import type { CustomFieldDef } from "@/lib/types";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

/**
 * 設定で定義したカスタム項目を、タイプに応じた入力欄として描画する。
 * name は `cf_<defId>`（actions.ts の readCustomValues と対）。
 */
export default function CustomFieldInputs({
  defs,
  values,
}: {
  defs: CustomFieldDef[];
  values?: Record<string, string>;
}) {
  if (defs.length === 0) return null;
  return (
    <>
      {defs.map((def) => {
        const name = `cf_${def.id}`;
        const value = values?.[def.id] ?? "";
        return (
          <label key={def.id} className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">{def.name}</span>
            {def.fieldType === "select" ? (
              <select name={name} defaultValue={value} className={inputCls}>
                <option value="">（未選択）</option>
                {(def.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={def.fieldType === "number" ? "number" : def.fieldType === "date" ? "date" : "text"}
                step={def.fieldType === "number" ? "any" : undefined}
                name={name}
                defaultValue={value}
                className={inputCls}
              />
            )}
          </label>
        );
      })}
    </>
  );
}
