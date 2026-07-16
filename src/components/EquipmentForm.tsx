import Link from "next/link";
import {
  EQUIPMENT_STATUS_LABEL,
  type Equipment,
  type EquipmentStatus,
  type CustomFieldDef,
  type Site,
} from "@/lib/types";
import SubmitButton from "@/components/SubmitButton";
import AutoManagementNoButton from "@/components/AutoManagementNoButton";
import CustomFieldInputs from "@/components/CustomFieldInputs";
import SitePicker from "@/components/SitePicker";

// 廃止(retired)は詳細画面の「廃止する」専用操作に一本化するため、状態セレクトからは除外。
// ただし編集時に現在 retired の場合のみ選択肢として表示する。
const BASE_STATUSES: EquipmentStatus[] = ["active", "stopped", "repair"];

/** 設備の登録/編集フォーム。action にバインド済み Server Action を渡す。 */
export default function EquipmentForm({
  action,
  initial,
  submitLabel,
  today,
  defs,
  sites,
}: {
  action: (formData: FormData) => void | Promise<void>;
  initial?: Equipment | null;
  submitLabel: string;
  today?: string;
  defs: CustomFieldDef[];
  sites: Site[]; // listSitesWithAreas の結果（areas 込み）
}) {
  const statuses: EquipmentStatus[] =
    initial?.status === "retired" ? [...BASE_STATUSES, "retired"] : BASE_STATUSES;
  // 新規登録時は導入日を今日で既定表示
  const defaultInstalledDate = initial ? (initial.installedDate ?? "") : (today ?? "");
  return (
    <form action={action} className="flex flex-col gap-5">
      <Section title="基本情報">
        <Grid>
          <Field label="管理番号" required>
            <div className="flex gap-2">
              <input name="managementNo" required defaultValue={initial?.managementNo ?? ""} placeholder="例: S-0001" className={inputCls} />
              {!initial && <AutoManagementNoButton />}
            </div>
          </Field>
          <Field label="設備名" required>
            <input name="name" required defaultValue={initial?.name ?? ""} placeholder="例: NCフライス盤 1号機" className={inputCls} />
          </Field>
          <Field label="カテゴリ">
            <input name="category" defaultValue={initial?.category ?? ""} placeholder="例: 工作機械" className={inputCls} />
          </Field>
          {sites.length > 0 ? (
            <SitePicker
              sites={sites}
              defaultSiteId={initial?.siteId}
              defaultAreaId={initial?.areaId}
            />
          ) : null}
          <Field label="詳細位置">
            <input name="location" defaultValue={initial?.location ?? ""} placeholder="例: Aライン奥・2階東側 など" className={inputCls} />
          </Field>
          <Field label="メーカー">
            <input name="maker" defaultValue={initial?.maker ?? ""} placeholder="例: ○○機械工業" className={inputCls} />
          </Field>
          <Field label="型式">
            <input name="modelNo" defaultValue={initial?.modelNo ?? ""} placeholder="例: MB-46V" className={inputCls} />
          </Field>
          <Field label="製造番号 / シリアル">
            <input name="serialNo" defaultValue={initial?.serialNo ?? ""} className={inputCls} />
          </Field>
          <Field label="導入日">
            <input type="date" name="installedDate" defaultValue={defaultInstalledDate} className={inputCls} />
          </Field>
          <Field label="状態">
            <select name="status" defaultValue={initial?.status ?? "active"} className={inputCls}>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {EQUIPMENT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          {initial?.status === "retired" && (
            <Field label="廃止日">
              <input type="date" name="disposalDate" defaultValue={initial?.disposalDate ?? ""} className={inputCls} />
            </Field>
          )}
        </Grid>
        {sites.length === 0 && (
          <p className="mt-2 text-xs text-slate-400">
            ※ 「設定」ページで工場・職場を登録すると、設置場所を工場/職場のセレクトで選べるようになります。
          </p>
        )}
        {initial?.status === "retired" && (
          <p className="mt-2 text-xs text-slate-400">
            ※ 廃止日を空欄にして状態を変更すると、廃止が解除されます。廃止/復元は詳細画面からも操作できます。
          </p>
        )}
      </Section>

      {defs.length > 0 && (
        <Section title="カスタム項目">
          <div className="grid gap-4 sm:grid-cols-2">
            <CustomFieldInputs defs={defs} values={initial?.customValues} />
          </div>
          <p className="mt-2 text-xs text-slate-400">
            ※ カスタム項目は「設定」ページで追加・変更できます。
          </p>
        </Section>
      )}

      <Section title="備考">
        <textarea name="notes" rows={3} defaultValue={initial?.notes ?? ""} placeholder="メモ・特記事項" className={inputCls} />
      </Section>

      <div className="flex items-center gap-3">
        <SubmitButton pendingText="保存中…" className="h-11 min-w-32">{submitLabel}</SubmitButton>
        <Link
          href={initial ? `/equipment/${initial.id}` : "/equipment"}
          className="inline-flex h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          キャンセル
        </Link>
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="mb-4 text-sm font-bold text-slate-700">{title}</h2>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-600">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
