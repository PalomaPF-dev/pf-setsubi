"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Undo2,
  CheckCircle2,
  Loader2,
  Send,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import {
  approveInspectionAction,
  returnInspectionAction,
  resubmitInspectionAction,
} from "@/lib/actions";
import { APPROVAL_STATUS_LABEL, type ApprovalStatus } from "@/lib/types";
import { ApprovalStatusBadge } from "@/components/Badges";

/**
 * 点検記録の承認パネル（承認 / 差し戻し / 再提出）。
 * サーバーアクションを直接呼び、revalidatePath でこのページが更新される。
 */
export default function InspectionApprovalPanel({
  recordId,
  status,
  approverName,
  approvedAt,
  reviewComment,
  equipmentId,
}: {
  recordId: string;
  status: ApprovalStatus;
  approverName: string | null;
  approvedAt: string | null;
  reviewComment: string | null;
  equipmentId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "returning">("idle");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  function approve() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await approveInspectionAction(recordId);
        if (res?.error) setError(res.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : "承認に失敗しました");
      }
    });
  }

  function submitReturn() {
    setError(null);
    if (!comment.trim()) {
      setError("差し戻しの理由を入力してください");
      return;
    }
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("comment", comment.trim());
        const res = await returnInspectionAction(recordId, fd);
        if (res?.error) {
          setError(res.error);
          return;
        }
        setMode("idle");
        setComment("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "差し戻しに失敗しました");
      }
    });
  }

  function resubmit() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await resubmitInspectionAction(recordId);
        if (res?.error) setError(res.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : "再提出に失敗しました");
      }
    });
  }

  const tone =
    status === "approved"
      ? "border-emerald-200 bg-emerald-50"
      : status === "returned"
        ? "border-red-200 bg-red-50"
        : "border-amber-200 bg-amber-50";

  return (
    <div className={`mb-6 rounded-2xl border p-4 sm:p-5 ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
          <ShieldCheck className="h-4 w-4 text-slate-500" />
          承認ワークフロー
        </h2>
        <ApprovalStatusBadge status={status} />
      </div>

      {/* ステータス別の説明・履歴 */}
      {status === "approved" && (
        <p className="mt-2 text-sm text-emerald-700">
          {approverName ? `${approverName} が承認済み` : "承認済み"}
          {approvedAt && `（${approvedAt.slice(0, 16).replace("T", " ")}）`}。この点検は完了として確定しています。
        </p>
      )}
      {status === "pending" && (
        <p className="mt-2 text-sm text-amber-800">
          作業者による点検が完了し、承認待ちです。内容を確認して承認または差し戻してください。
        </p>
      )}
      {status === "returned" && (
        <div className="mt-2">
          <p className="text-sm font-medium text-red-700">
            差し戻されました{approverName && `（${approverName}）`}。再点検のうえ再提出してください。
          </p>
          {reviewComment && (
            <div className="mt-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-slate-700">
              <span className="text-xs font-semibold text-red-600">差し戻し理由</span>
              <p className="mt-0.5 whitespace-pre-wrap">{reviewComment}</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-white/70 px-3 py-2 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* 操作 */}
      {status === "pending" && mode === "idle" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={approve}
            disabled={pending}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            承認する
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("returning");
              setError(null);
            }}
            disabled={pending}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-red-300 bg-white px-4 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Undo2 className="h-4 w-4" />
            差し戻す
          </button>
        </div>
      )}

      {status === "pending" && mode === "returning" && (
        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-medium text-red-700">差し戻しの理由（必須）</label>
          <textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="再点検が必要な理由や指示を記入してください"
            className="w-full rounded-xl border border-red-300 p-3 text-base focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={submitReturn}
              disabled={pending}
              className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              差し戻しを確定
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("idle");
                setError(null);
              }}
              disabled={pending}
              className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {status === "returned" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/equipment/${equipmentId}`}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-orange-700 px-4 text-sm font-bold text-white hover:bg-orange-800"
          >
            <ExternalLink className="h-4 w-4" />
            設備を開いて再点検
          </Link>
          <button
            type="button"
            onClick={resubmit}
            disabled={pending}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            この記録を再提出（承認待ちへ）
          </button>
        </div>
      )}

      {status === "approved" && (
        <p className="mt-3 text-xs text-slate-500">
          状態: {APPROVAL_STATUS_LABEL[status]}
        </p>
      )}
    </div>
  );
}
