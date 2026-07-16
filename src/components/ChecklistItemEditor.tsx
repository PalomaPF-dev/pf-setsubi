"use client";

import { useState } from "react";
import {
  ITEM_TYPE_LABEL,
  PHOTO_MODE_LABEL,
  type InspectionItem,
  type ItemType,
  type PhotoMode,
} from "@/lib/types";

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

/**
 * 点検項目の入力フィールド一式（新規追加・既存編集で共用）。
 * <form> は持たない — 呼び出し側の Server Action form（hidden の procedureId 付き）の中に置く。
 * タイプ select の値で numeric 用フィールドの表示と写真添付 select の固定を切り替える。
 * photo タイプは写真添付「必須」固定（disabled のため値は送信されないが、
 * サーバー側 normalizeItemInput が photo → required に正規化する）。
 */
export default function ChecklistItemFields({ item }: { item?: InspectionItem }) {
  const [itemType, setItemType] = useState<ItemType>(item?.itemType ?? "ok_ng");
  const [photoMode, setPhotoMode] = useState<PhotoMode>(item?.photoMode ?? "none");
  const isNumeric = itemType === "numeric";
  const isPhoto = itemType === "photo";
  // NG 判定が発生するのは ok_ng（手動）と numeric（しきい値）のみ
  const hasJudgment = itemType === "ok_ng" || itemType === "numeric";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="項目名（必須）">
        <input
          name="label"
          defaultValue={item?.label ?? ""}
          required
          placeholder="例: 作動油の油量"
          className={inputCls}
        />
      </Field>
      <Field label="タイプ">
        <select
          name="itemType"
          value={itemType}
          onChange={(e) => setItemType(e.target.value as ItemType)}
          className={inputCls}
        >
          {(Object.keys(ITEM_TYPE_LABEL) as ItemType[]).map((t) => (
            <option key={t} value={t}>
              {ITEM_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="補足（点検方法など・任意）" full>
        <input
          name="instruction"
          defaultValue={item?.instruction ?? ""}
          placeholder="例: ゲージの赤線の範囲内にあること"
          className={inputCls}
        />
      </Field>
      {isNumeric && (
        <>
          <Field label="単位（任意）">
            <input
              name="unit"
              defaultValue={item?.unit ?? ""}
              placeholder="例: MPa"
              className={inputCls}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="下限（以上でOK）">
              <input
                type="number"
                step="any"
                inputMode="decimal"
                name="minValue"
                defaultValue={item?.minValue ?? ""}
                placeholder="例: 0.5"
                className={inputCls}
              />
            </Field>
            <Field label="上限（以下でOK）">
              <input
                type="number"
                step="any"
                inputMode="decimal"
                name="maxValue"
                defaultValue={item?.maxValue ?? ""}
                placeholder="例: 0.9"
                className={inputCls}
              />
            </Field>
          </div>
        </>
      )}
      <Field label={isPhoto ? "写真添付（写真タイプは必須固定）" : "写真添付"}>
        <select
          name="photoMode"
          value={isPhoto ? "required" : photoMode}
          onChange={(e) => setPhotoMode(e.target.value as PhotoMode)}
          disabled={isPhoto}
          className={`${inputCls} ${isPhoto ? "bg-slate-100 text-slate-500" : ""}`}
        >
          {(Object.keys(PHOTO_MODE_LABEL) as PhotoMode[]).map((m) => (
            <option key={m} value={m}>
              {PHOTO_MODE_LABEL[m]}
            </option>
          ))}
        </select>
      </Field>
      {hasJudgment && (
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-600 sm:self-end">
          <input
            type="checkbox"
            name="requireCommentOnNg"
            defaultChecked={item?.requireCommentOnNg ?? false}
            className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
          />
          NG のときコメントを必須にする
        </label>
      )}
    </div>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      {children}
    </div>
  );
}
