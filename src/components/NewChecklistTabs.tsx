"use client";

import { useState } from "react";
import Link from "next/link";
import { FileUp } from "lucide-react";
import { createProcedureAction, createProcedureFromTemplateAction } from "@/lib/actions";
import { PROCEDURE_TEMPLATES, type ProcedureTemplateItem } from "@/lib/procedureTemplates";
import SubmitButton from "@/components/SubmitButton";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

const ITEM_TYPE_LABELS: Record<string, string> = {
  ok_ng: "判定",
  numeric: "数値",
  text: "テキスト",
  photo: "写真",
};

function numericRange(item: ProcedureTemplateItem): string | null {
  if (item.itemType !== "numeric") return null;
  if (item.min === undefined && item.max === undefined) return null;
  const unit = item.unit ? ` ${item.unit}` : "";
  return `基準 ${item.min ?? ""}〜${item.max ?? ""}${unit}`;
}

export default function NewChecklistTabs() {
  const [tab, setTab] = useState<"blank" | "template">("blank");

  const tabCls = (active: boolean) =>
    `-mb-px border-b-2 px-1 pb-2 text-sm transition-colors ${
      active
        ? "border-orange-600 font-semibold text-orange-700"
        : "border-transparent text-slate-500 hover:text-slate-700"
    }`;

  return (
    <div>
      <div className="mb-4 flex gap-5 border-b border-slate-200" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "blank"}
          onClick={() => setTab("blank")}
          className={tabCls(tab === "blank")}
        >
          白紙から作成
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "template"}
          onClick={() => setTab("template")}
          className={tabCls(tab === "template")}
        >
          テンプレートから作成
        </button>
        <Link
          href="/checklists/import"
          className="-mb-px ml-auto inline-flex items-center gap-1 border-b-2 border-transparent px-1 pb-2 text-sm text-orange-700 hover:text-orange-800"
        >
          <FileUp className="h-3.5 w-3.5" />
          Excel/PDFから取り込み
        </Link>
      </div>

      {tab === "blank" ? (
        <form
          action={createProcedureAction}
          className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              手順書名（必須）
            </label>
            <input
              name="name"
              required
              placeholder="例: フォークリフト 始業前点検"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">説明（任意）</label>
            <textarea
              name="description"
              rows={3}
              placeholder="例: 毎朝の始業前に運転者が実施する日常点検"
              className={inputCls}
            />
          </div>
          <SubmitButton pendingText="作成中…" className="h-11">
            作成して項目を編集
          </SubmitButton>
        </form>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {PROCEDURE_TEMPLATES.map((tpl) => (
            <div
              key={tpl.key}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-md bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 ring-1 ring-inset ring-orange-600/20">
                  {tpl.category}
                </span>
                <span className="text-xs text-slate-400">{tpl.recommendedInterval}</span>
              </div>
              <h3 className="mt-2 font-semibold text-slate-800">{tpl.name}</h3>
              <p className="mt-1 text-xs text-slate-500">{tpl.description}</p>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-orange-700">
                  項目を見る（{tpl.items.length}）
                </summary>
                <ul className="mt-1.5 space-y-1">
                  {tpl.items.map((item, i) => {
                    const range = numericRange(item);
                    return (
                      <li key={i} className="text-xs text-slate-600">
                        <span className="mr-1.5 rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500">
                          {ITEM_TYPE_LABELS[item.itemType] ?? item.itemType}
                        </span>
                        {item.label}
                        {range && <span className="ml-1 text-[10px] text-slate-400">{range}</span>}
                      </li>
                    );
                  })}
                </ul>
              </details>
              <form action={createProcedureFromTemplateAction.bind(null, tpl.key)} className="mt-auto pt-3">
                <SubmitButton pendingText="作成中…" className="w-full">
                  このテンプレートで作成
                </SubmitButton>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
