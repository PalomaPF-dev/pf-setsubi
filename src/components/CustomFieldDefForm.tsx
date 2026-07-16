"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { CUSTOM_FIELD_TYPE_LABEL, type CustomFieldType } from "@/lib/types";
import SubmitButton from "@/components/SubmitButton";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

/**
 * カスタム項目の追加フォーム（設定ページ用）。
 * タイプで「選択肢」を選んだときだけ選択肢テキストエリアを表示するため client component。
 * 送信は props で受けた Server Action（createCustomFieldDefAction）。
 */
export default function CustomFieldDefForm({
  action,
}: {
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [fieldType, setFieldType] = useState<CustomFieldType>("text");

  return (
    <form action={action} className="rounded-xl bg-slate-50 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">項目名</label>
          <input name="name" required placeholder="例: 資産番号" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">タイプ</label>
          <select
            name="fieldType"
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value as CustomFieldType)}
            className={inputCls}
          >
            {(Object.keys(CUSTOM_FIELD_TYPE_LABEL) as CustomFieldType[]).map((t) => (
              <option key={t} value={t}>
                {CUSTOM_FIELD_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        {fieldType === "select" && (
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">
              選択肢（カンマまたは改行区切り）
            </label>
            <textarea
              name="options"
              rows={3}
              required
              placeholder={"例: 自社保有, リース, レンタル"}
              className={inputCls}
            />
          </div>
        )}
      </div>
      <div className="mt-3">
        <SubmitButton pendingText="追加中…" className="!px-3 !py-1.5 text-xs">
          <span className="inline-flex items-center gap-1">
            <Plus className="h-3.5 w-3.5" />
            カスタム項目を追加
          </span>
        </SubmitButton>
      </div>
    </form>
  );
}
