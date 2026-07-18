"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  History,
  Loader2,
  MapPin,
  Maximize2,
  MessageSquarePlus,
  Mic,
  Pencil,
  Play,
  RefreshCw,
  Send,
  UserRound,
  Video,
  Volume2,
  WifiOff,
  X,
  XCircle,
} from "lucide-react";
import PhotoInput from "@/components/PhotoInput";
import AudioRecorder from "@/components/AudioRecorder";
import VideoInput from "@/components/VideoInput";
import MediaStrip from "@/components/MediaStrip";
import { formatDuration } from "@/components/MediaStrip";
import MediaLightbox from "@/components/MediaLightbox";
import ProcedureDiagramView, { type DiagramPin } from "@/components/ProcedureDiagramView";
import { judgeNumeric } from "@/lib/inspection";
import { MAX_RESULT_MEDIA_PER_ITEM } from "@/lib/mediaLimits";
import {
  completeInspectionAction,
  type CompleteInspectionPayload,
  type WizardAnswer,
} from "@/lib/actions";
import {
  ITEM_TYPE_LABEL,
  type EquipmentProcedure,
  type InspectionItem,
  type ItemReferenceMedia,
  type Judgment,
  type MediaType,
} from "@/lib/types";

// ===== 回答の下書き（localStorage にそのまま保存する形） =====

/** 記録メディア（音声・動画。アップロード済み URL を保持） */
interface DraftMedia {
  type: MediaType;
  url: string;
  durationSec: number | null;
}

interface AnswerDraft {
  /** ok_ng の選択 */
  judgment: Judgment | null;
  /** numeric の生入力（文字列のまま保持） */
  numericRaw: string;
  /** numeric: 基準値外を OK に上書きしたか */
  overrideOk: boolean;
  /** text の回答 / それ以外のコメント・NG理由 */
  text: string;
  photoUrl: string | null;
  /** 追加の記録メディア（音声・動画） */
  media: DraftMedia[];
  /** optional 写真の展開状態 */
  photoOpen: boolean;
  /** 任意コメント欄の展開状態 */
  commentOpen: boolean;
}

const EMPTY_ANSWER: AnswerDraft = {
  judgment: null,
  numericRaw: "",
  overrideOk: false,
  text: "",
  photoUrl: null,
  media: [],
  photoOpen: false,
  commentOpen: false,
};

interface DraftData {
  answers: Record<string, AnswerDraft>;
  index: number;
  draftKey: string;
  inspectorName?: string;
  workerConfirmed?: boolean;
}

// ===== 純関数ヘルパー =====

/** 全角数字・記号を半角化してから数値へ。空・非数値は null。 */
function parseNumeric(raw: string): number | null {
  const half = raw
    .trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/．/g, ".")
    .replace(/－|ー/g, "-")
    .replace(/[,，]/g, "");
  if (half === "") return null;
  const n = Number(half);
  return Number.isFinite(n) ? n : null;
}

/** 数値項目の基準表示（min/max 片方 null なら「◯以上」「◯以下」）。 */
function rangeLabel(item: InspectionItem): string {
  const unit = item.unit ? ` ${item.unit}` : "";
  if (item.minValue != null && item.maxValue != null)
    return `${item.minValue} 〜 ${item.maxValue}${unit}`;
  if (item.minValue != null) return `${item.minValue} 以上${unit}`;
  if (item.maxValue != null) return `${item.maxValue} 以下${unit}`;
  return "なし（記録のみ）";
}

interface ItemEval {
  /** 「次へ」に進める（必須条件を満たしている） */
  done: boolean;
  /** 表示上の判定（text/photo は null） */
  effJudgment: Judgment | null;
  /** 数値のしきい値自動判定 */
  autoJudgment: Judgment | null;
  numericValue: number | null;
  /** コメントが必須か */
  needsComment: boolean;
}

function evalItem(item: InspectionItem, a: AnswerDraft): ItemEval {
  let done = true;
  let eff: Judgment | null = null;
  let auto: Judgment | null = null;
  let numericValue: number | null = null;
  let needsComment = false;

  if (item.itemType === "ok_ng") {
    eff = a.judgment;
    if (!a.judgment) done = false;
    if (a.judgment === "ng" && item.requireCommentOnNg) needsComment = true;
  } else if (item.itemType === "numeric") {
    numericValue = parseNumeric(a.numericRaw);
    if (numericValue == null) {
      done = false;
    } else {
      auto = judgeNumeric(numericValue, item.minValue, item.maxValue);
      eff = auto === "ng" && a.overrideOk ? "ok" : auto;
      if (auto === "ng" && a.overrideOk) needsComment = true; // 基準外を OK とする理由
      if (eff === "ng" && item.requireCommentOnNg) needsComment = true;
    }
  } else if (item.itemType === "photo") {
    if (!a.photoUrl) done = false;
  }
  // text は任意入力（判定なし）

  if (item.photoMode === "required" && !a.photoUrl) done = false;
  if (needsComment && a.text.trim() === "") done = false;

  return { done, effJudgment: eff, autoJudgment: auto, numericValue, needsComment };
}

/** クライアントのローカル日付を YYYY-MM-DD で（date input の初期値）。 */
function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function genDraftKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `dk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

// ===== 本体 =====

/**
 * 点検実施ウィザード（1画面=1項目）。
 * 入力のたび localStorage に下書き保存し、中断しても再開できる。
 * 完了時は completeInspectionAction がサーバーで再検証・スナップショット保存する。
 */
export default function InspectionWizard({
  assignment,
  equipmentName,
  managementNo,
  items,
  referenceMedia,
  diagramUrl,
  workerRoster = [],
  userName,
}: {
  assignment: EquipmentProcedure;
  equipmentName: string;
  managementNo: string;
  items: InspectionItem[];
  /** itemId → 正常見本メディア（Map は serialize 不可のため Object で受ける） */
  referenceMedia?: Record<string, ItemReferenceMedia[]>;
  /** 点検部位マップの図面（各項目の mapX/mapY にピン表示） */
  diagramUrl?: string | null;
  /** 作業者名簿（点検開始時に選択） */
  workerRoster?: string[];
  userName: string;
}) {
  const storageKey = `insp-draft:${assignment.id}`;

  // 点検部位マップのピン（座標を持つ項目のみ）。番号は項目一覧での並び順（1始まり）。
  const diagramPins = useMemo<DiagramPin[]>(
    () =>
      items
        .map((it, i) => ({ it, number: i + 1 }))
        .filter(({ it }) => it.mapX != null && it.mapY != null)
        .map(({ it, number }) => ({
          id: it.id,
          label: it.label,
          number,
          x: it.mapX as number,
          y: it.mapY as number,
        })),
    [items]
  );

  const [answers, setAnswers] = useState<Record<string, AnswerDraft>>({});
  const [index, setIndex] = useState(0); // items.length = 最終確認画面
  const [draftKey, setDraftKey] = useState<string>(() => genDraftKey());
  const [ready, setReady] = useState(false); // 下書きチェック完了後に保存開始
  const [resume, setResume] = useState<DraftData | null>(null);
  // 作業者（点検開始時に選択）。確定するまで点検項目へ進まない。
  const [inspectorName, setInspectorName] = useState<string>(userName ?? "");
  const [workerConfirmed, setWorkerConfirmed] = useState(false);
  const [online, setOnline] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [inspectionDate, setInspectionDate] = useState<string>(() => todayLocal());
  const [notes, setNotes] = useState("");

  // 下書きの読み込み（あれば再開プロンプト）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const d = JSON.parse(raw) as DraftData;
        if (d && d.answers && typeof d.index === "number" && d.draftKey) {
          setResume(d);
          return;
        }
      }
    } catch {
      /* 壊れた下書きは無視 */
    }
    setReady(true);
  }, [storageKey]);

  // 状態変更のたびに下書き保存
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ answers, index, draftKey, inspectorName, workerConfirmed })
      );
    } catch {
      /* 容量超過などは無視（アプリ動作は継続） */
    }
  }, [ready, answers, index, draftKey, inspectorName, workerConfirmed, storageKey]);

  // オンライン監視
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  function acceptResume() {
    if (resume) {
      const normalized: Record<string, AnswerDraft> = {};
      for (const [k, v] of Object.entries(resume.answers)) {
        // 旧下書き（media なし）との互換: 欠損・破損フィールドを補完する
        const merged: AnswerDraft = { ...EMPTY_ANSWER, ...v };
        if (!Array.isArray(merged.media)) merged.media = [];
        normalized[k] = merged;
      }
      setAnswers(normalized);
      setIndex(Math.max(0, Math.min(resume.index, items.length)));
      setDraftKey(resume.draftKey);
      // 旧下書き（作業者フィールドなし）は途中再開なので確定済み扱い
      setInspectorName(resume.inspectorName ?? userName ?? "");
      setWorkerConfirmed(resume.workerConfirmed ?? true);
    }
    setResume(null);
    setReady(true);
  }

  function discardResume() {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* noop */
    }
    setResume(null);
    setReady(true);
  }

  function getAns(id: string): AnswerDraft {
    return answers[id] ?? EMPTY_ANSWER;
  }

  function setAns(id: string, patch: Partial<AnswerDraft>) {
    setAnswers((prev) => ({
      ...prev,
      [id]: { ...EMPTY_ANSWER, ...prev[id], ...patch },
    }));
  }

  // メディアの追加/削除は functional update（録音完了コールバックの古い closure 対策）
  function addMedia(id: string, m: DraftMedia) {
    setAnswers((prev) => {
      const cur: AnswerDraft = { ...EMPTY_ANSWER, ...prev[id] };
      if (cur.media.length >= MAX_RESULT_MEDIA_PER_ITEM) return prev;
      return { ...prev, [id]: { ...cur, media: [...cur.media, m] } };
    });
  }

  function removeMedia(id: string, index: number) {
    setAnswers((prev) => {
      const cur: AnswerDraft = { ...EMPTY_ANSWER, ...prev[id] };
      return { ...prev, [id]: { ...cur, media: cur.media.filter((_, i) => i !== index) } };
    });
  }

  const evals = useMemo(
    () => items.map((it) => evalItem(it, answers[it.id] ?? EMPTY_ANSWER)),
    [items, answers]
  );
  const doneCount = evals.filter((e) => e.done).length;
  const ngCount = evals.filter((e) => e.effJudgment === "ng").length;
  const incomplete = items
    .map((it, i) => ({ it, i }))
    .filter(({ i }) => !evals[i].done);
  const isConfirm = index >= items.length;
  const current = isConfirm ? null : items[index];
  const currentEval = isConfirm ? null : evals[index];

  function buildPayload(): CompleteInspectionPayload {
    const wizardAnswers: WizardAnswer[] = items.map((item, i) => {
      const a = getAns(item.id);
      const ev = evals[i];
      const w: WizardAnswer = {
        itemId: item.id,
        valueText: a.text.trim() || null,
        photoUrl: a.photoUrl,
      };
      if (a.media.length > 0) {
        w.media = a.media.map((m) => ({
          type: m.type,
          url: m.url,
          durationSeconds: m.durationSec,
        }));
      }
      if (item.itemType === "ok_ng") {
        w.judgment = a.judgment;
      } else if (item.itemType === "numeric") {
        w.valueNumeric = ev.numericValue;
        // 上書き時のみ ok を明示。null ならサーバーがしきい値から自動判定する。
        w.judgment = ev.autoJudgment === "ng" && a.overrideOk ? "ok" : null;
      }
      return w;
    });
    return {
      assignmentId: assignment.id,
      inspectionDate,
      notes: notes.trim() || null,
      inspectorName: inspectorName.trim() || null,
      itemsSignature: items.map((i) => ({ id: i.id, updatedAt: i.updatedAt })),
      answers: wizardAnswers,
      // 冪等キー: 応答喪失後の再送でも同一記録として扱われる（二重登録防止）
      clientKey: draftKey,
    };
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const payload = buildPayload();
    try {
      // 想定内の検証エラーは戻り値（本番ビルドでは throw のメッセージがマスクされるため）。
      // 成功時は redirect が throw する。
      const res = await completeInspectionAction(payload);
      if (res?.error) {
        setSubmitError(res.error);
        setSubmitting(false);
        return;
      }
    } catch (e) {
      const digest = (e as { digest?: string })?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
        // digest 形式: "NEXT_REDIRECT;{push|replace};{url};{status};"
        const dest = digest.split(";").slice(2, -2).join(";");
        if (dest.startsWith("/inspections/")) {
          // 保存成功の遷移が確定したここで初めて下書きを削除する。
          // （/login 等の認可リダイレクトでは下書きを保持したまま遷移）
          try {
            localStorage.removeItem(storageKey);
          } catch {
            /* noop */
          }
        }
        return;
      }
      // 通信失敗など。本番では e.message が汎用文言にマスクされるため固定文言を出す。
      // 下書きは削除していないのでそのまま残っている。
      setSubmitError("点検の保存に失敗しました。通信環境を確認して再送してください。");
      setSubmitting(false);
    }
  }

  // ===== 再開プロンプト =====
  if (resume) {
    return (
      <div className="mx-auto max-w-md p-4 sm:p-6">
        <div className="mt-8 rounded-2xl border border-orange-200 bg-orange-50 p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
            <History className="h-6 w-6" />
          </div>
          <h2 className="text-base font-bold text-slate-800">前回の続きから再開しますか？</h2>
          <p className="mt-2 text-sm text-slate-600">
            「{equipmentName}」の入力途中の下書きが残っています。
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={discardResume}
              className="h-12 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              破棄して最初から
            </button>
            <button
              type="button"
              onClick={acceptResume}
              className="h-12 rounded-xl bg-orange-700 text-sm font-bold text-white hover:bg-orange-800"
            >
              再開する
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== 作業者選択（点検開始前） =====
  if (!workerConfirmed) {
    return (
      <WorkerSelectScreen
        equipmentName={equipmentName}
        managementNo={managementNo}
        procedureName={assignment.procedureName ?? "点検"}
        roster={workerRoster}
        value={inspectorName}
        onChange={setInspectorName}
        onStart={() => setWorkerConfirmed(true)}
      />
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      {/* ===== 固定ヘッダ: 設備名・手順書名・進捗 ===== */}
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-lg px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-slate-800">
                {equipmentName}
                {managementNo && (
                  <span className="ml-1.5 text-xs font-normal text-slate-400">{managementNo}</span>
                )}
              </div>
              <div className="truncate text-xs text-slate-500">
                {assignment.procedureName ?? "点検"}
              </div>
            </div>
            <div className="shrink-0 text-sm font-bold text-orange-700">
              {doneCount} / {items.length}
            </div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-orange-600 transition-all duration-300"
              style={{ width: `${Math.round((doneCount / items.length) * 100)}%` }}
            />
          </div>
          {/* 進捗ドット（タップでジャンプ） */}
          <div className="mt-1.5 flex flex-wrap gap-0.5">
            {items.map((it, i) => {
              const ev = evals[i];
              const color =
                ev.effJudgment === "ng"
                  ? "bg-red-500"
                  : ev.done
                    ? "bg-orange-600"
                    : "bg-slate-300";
              const isCurrent = i === index;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`項目 ${i + 1}: ${it.label}`}
                  className="flex h-7 w-7 items-center justify-center"
                >
                  <span
                    className={`h-3 w-3 rounded-full transition ${color} ${
                      isCurrent ? "ring-2 ring-orange-400 ring-offset-2" : ""
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>
        {/* オフラインバナー */}
        {!online && (
          <div className="flex items-center justify-center gap-1.5 bg-amber-50 px-4 py-1.5 text-xs font-medium text-amber-700">
            <WifiOff className="h-3.5 w-3.5" />
            オフラインです。写真・音声・動画のアップロードと完了は通信回復後に行ってください
          </div>
        )}
      </div>

      {/* ===== 本文 ===== */}
      <div className="mx-auto w-full max-w-lg flex-1 px-4 py-5">
        {current && currentEval ? (
          <ItemCard
            key={current.id}
            item={current}
            index={index}
            total={items.length}
            answer={getAns(current.id)}
            ev={currentEval}
            draftKey={draftKey}
            refMedia={referenceMedia?.[current.id] ?? []}
            diagramUrl={diagramUrl ?? null}
            diagramPins={diagramPins}
            setAns={setAns}
            addMedia={addMedia}
            removeMedia={removeMedia}
          />
        ) : (
          <ConfirmScreen
            items={items}
            evals={evals}
            getAns={getAns}
            ngCount={ngCount}
            incomplete={incomplete}
            jumpTo={setIndex}
            inspectionDate={inspectionDate}
            setInspectionDate={setInspectionDate}
            inspectorName={inspectorName}
            onEditWorker={() => setWorkerConfirmed(false)}
            notes={notes}
            setNotes={setNotes}
            submitError={submitError}
            submitting={submitting}
            onRetry={() => void submit()}
          />
        )}
      </div>

      {/* ===== 画面下部固定バー ===== */}
      <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          {isConfirm ? (
            <>
              <button
                type="button"
                onClick={() => setIndex(items.length - 1)}
                disabled={submitting}
                className="inline-flex h-14 w-24 shrink-0 items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-5 w-5" />
                戻る
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting || incomplete.length > 0}
                className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-orange-700 text-lg font-bold text-white shadow-sm hover:bg-orange-800 disabled:opacity-40"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    送付中…
                  </>
                ) : (
                  <>
                    <Send className="h-6 w-6" />
                    送付（申請）する
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
                className="inline-flex h-12 w-24 shrink-0 items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-5 w-5" />
                戻る
              </button>
              <button
                type="button"
                onClick={() => setIndex((i) => Math.min(items.length, i + 1))}
                disabled={!currentEval?.done}
                className="inline-flex h-12 flex-1 items-center justify-center gap-1 rounded-xl bg-orange-700 text-base font-bold text-white shadow-sm hover:bg-orange-800 disabled:opacity-40"
              >
                {index === items.length - 1 ? "確認へ" : "次へ"}
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== 1項目カード =====

function ItemCard({
  item,
  index,
  total,
  answer: a,
  ev,
  draftKey,
  refMedia,
  diagramUrl,
  diagramPins,
  setAns,
  addMedia,
  removeMedia,
}: {
  item: InspectionItem;
  index: number;
  total: number;
  answer: AnswerDraft;
  ev: ItemEval;
  draftKey: string;
  refMedia: ItemReferenceMedia[];
  diagramUrl: string | null;
  diagramPins: DiagramPin[];
  setAns: (id: string, patch: Partial<AnswerDraft>) => void;
  addMedia: (id: string, m: DraftMedia) => void;
  removeMedia: (id: string, index: number) => void;
}) {
  const requiredPhoto = item.photoMode === "required";
  // この項目が図面上のどこか（ピンがある場合のみ部位マップを表示）
  const hasPinForItem = diagramPins.some((p) => p.id === item.id);
  const showDiagram = !!diagramUrl && hasPinForItem;
  const overriding = ev.autoJudgment === "ng" && a.overrideOk;

  // 録音/録画のインライン展開と、記録済みメディアチップのプレビュー
  const [recorder, setRecorder] = useState<"audio" | "video" | null>(null);
  const [preview, setPreview] = useState<{ type: MediaType; url: string } | null>(null);
  const mediaFull = a.media.length >= MAX_RESULT_MEDIA_PER_ITEM;

  // コメント欄（text タイプ以外）: NG・上書き時は自動展開＋必須ラベル
  const commentForced = ev.effJudgment === "ng" || overriding;
  const commentVisible = commentForced || a.commentOpen || a.text.trim() !== "";
  const commentLabel = overriding
    ? "基準外を OK とする理由（必須）"
    : ev.effJudgment === "ng"
      ? item.requireCommentOnNg
        ? "NG理由（必須）"
        : "NG理由・状況"
      : "コメント・特記事項（任意）";
  const commentRequired = ev.needsComment;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 text-xs font-medium text-orange-700">
        項目 {index + 1} / {total}・{ITEM_TYPE_LABEL[item.itemType]}
      </div>
      <h2 className="text-lg font-bold text-slate-900">{item.label}</h2>
      {item.instruction && <p className="mt-1.5 text-sm text-slate-500">{item.instruction}</p>}

      {/* --- 点検箇所（どこを見るか）: 大きく目立たせる。タップで全画面拡大 --- */}
      {item.spotPhotoUrl && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-orange-700">
            <MapPin className="h-4 w-4" />
            ここを点検（点検箇所）
          </div>
          <button
            type="button"
            onClick={() => setPreview({ type: "photo", url: item.spotPhotoUrl! })}
            className="relative block w-full overflow-hidden rounded-xl border-2 border-orange-200 bg-slate-100"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.spotPhotoUrl}
              alt="点検箇所"
              className="mx-auto block max-h-72 w-full object-contain"
            />
            <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white">
              <Maximize2 className="h-3.5 w-3.5" />
              タップで拡大
            </span>
          </button>
        </div>
      )}

      {/* --- 点検部位マップ（設備全体のどこか。この項目のピンを強調） --- */}
      {showDiagram && diagramUrl && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <div className="mb-2 text-xs font-semibold text-slate-500">
            点検部位マップ（設備全体での位置）
          </div>
          <ProcedureDiagramView diagramUrl={diagramUrl} pins={diagramPins} highlightId={item.id} />
        </div>
      )}

      {/* --- 正常な状態の見本（写真・音声・動画） --- */}
      {refMedia.length > 0 && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <div className="mb-2 text-xs font-semibold text-slate-500">正常な状態の見本</div>
          <MediaStrip
            items={refMedia.map((m) => ({
              type: m.mediaType,
              url: m.url,
              durationSeconds: m.durationSeconds,
              label: m.caption ?? undefined,
            }))}
          />
        </div>
      )}

      {/* --- タイプ別の入力 --- */}
      <div className="mt-5">
        {item.itemType === "ok_ng" && (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setAns(item.id, { judgment: "ok" })}
              className={`inline-flex h-16 items-center justify-center gap-2 rounded-xl text-xl font-bold transition ${
                a.judgment === "ok"
                  ? "bg-emerald-600 text-white ring-2 ring-emerald-400 ring-offset-2"
                  : "border-2 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              }`}
            >
              <CheckCircle2 className="h-7 w-7" />
              OK
            </button>
            <button
              type="button"
              onClick={() => setAns(item.id, { judgment: "ng" })}
              className={`inline-flex h-16 items-center justify-center gap-2 rounded-xl text-xl font-bold transition ${
                a.judgment === "ng"
                  ? "bg-red-600 text-white ring-2 ring-red-400 ring-offset-2"
                  : "border-2 border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
              }`}
            >
              <XCircle className="h-7 w-7" />
              NG
            </button>
          </div>
        )}

        {item.itemType === "numeric" && (
          <div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={a.numericRaw}
                onChange={(e) =>
                  setAns(item.id, { numericRaw: e.target.value, overrideOk: false })
                }
                placeholder="測定値"
                className="h-14 w-full rounded-xl border-2 border-slate-300 px-4 text-2xl font-semibold text-slate-900 focus:border-orange-500 focus:outline-none"
              />
              {item.unit && (
                <span className="shrink-0 text-lg font-medium text-slate-500">{item.unit}</span>
              )}
            </div>
            <p className="mt-1.5 text-sm text-slate-500">基準: {rangeLabel(item)}</p>

            {ev.numericValue != null && ev.autoJudgment === "ok" && (
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-sm font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                <CheckCircle2 className="h-4 w-4" />
                OK（基準内）
              </span>
            )}
            {ev.numericValue != null && ev.autoJudgment === "ng" && !a.overrideOk && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
                <p className="flex items-center gap-1.5 text-sm font-bold text-red-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  基準値外です（自動NG）
                </p>
                <button
                  type="button"
                  onClick={() => setAns(item.id, { overrideOk: true })}
                  className="mt-2 inline-flex h-10 items-center justify-center rounded-lg border border-red-300 bg-white px-3 text-sm font-semibold text-red-700 hover:bg-red-100"
                >
                  それでも OK にする
                </button>
              </div>
            )}
            {overriding && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-800">
                  基準値外ですが OK として記録します
                </p>
                <button
                  type="button"
                  onClick={() => setAns(item.id, { overrideOk: false })}
                  className="mt-1 text-xs font-medium text-amber-700 underline"
                >
                  NG に戻す
                </button>
              </div>
            )}
          </div>
        )}

        {item.itemType === "text" && (
          <textarea
            rows={4}
            value={a.text}
            onChange={(e) => setAns(item.id, { text: e.target.value })}
            placeholder="状況・所見などを記入"
            className="w-full rounded-xl border border-slate-300 p-3 text-base focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        )}

        {item.itemType === "photo" && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              写真（必須）
            </label>
            <PhotoInput
              value={a.photoUrl}
              onChange={(url) => setAns(item.id, { photoUrl: url })}
              draftKey={draftKey}
              itemId={item.id}
            />
          </div>
        )}
      </div>

      {/* --- 共通の写真（photo タイプ以外） --- */}
      {item.itemType !== "photo" && requiredPhoto && (
        <div className="mt-5">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">写真（必須）</label>
          <PhotoInput
            value={a.photoUrl}
            onChange={(url) => setAns(item.id, { photoUrl: url })}
            draftKey={draftKey}
            itemId={item.id}
          />
        </div>
      )}
      {item.itemType !== "photo" && item.photoMode === "optional" && (
        <div className="mt-5">
          {a.photoOpen || a.photoUrl ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                写真（任意）
              </label>
              <PhotoInput
                value={a.photoUrl}
                onChange={(url) => setAns(item.id, { photoUrl: url })}
                draftKey={draftKey}
                itemId={item.id}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAns(item.id, { photoOpen: true })}
              className="inline-flex h-11 items-center gap-1.5 text-sm font-medium text-orange-700 hover:text-orange-800"
            >
              <Camera className="h-4 w-4" />
              写真を追加
            </button>
          )}
        </div>
      )}

      {/* --- 記録メディア（音声・動画） --- */}
      <div className="mt-5">
        {a.media.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {a.media.map((m, i) => (
              <span
                key={`${m.url}-${i}`}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 py-1 pr-1 pl-2.5"
              >
                <button
                  type="button"
                  onClick={() => setPreview({ type: m.type, url: m.url })}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600"
                >
                  {m.type === "audio" ? (
                    <Volume2 className="h-4 w-4 text-orange-700" />
                  ) : m.type === "video" ? (
                    <Play className="h-4 w-4 text-orange-700" />
                  ) : (
                    <Camera className="h-4 w-4 text-orange-700" />
                  )}
                  {m.durationSec != null
                    ? formatDuration(m.durationSec)
                    : m.type === "video"
                      ? "動画"
                      : m.type === "audio"
                        ? "音声"
                        : "写真"}
                </button>
                <button
                  type="button"
                  onClick={() => removeMedia(item.id, i)}
                  aria-label="このメディアを削除"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </span>
            ))}
          </div>
        )}

        {recorder === "audio" ? (
          <AudioRecorder
            kind="result"
            keyPrefix={draftKey}
            onComplete={({ url, durationSec }) => {
              addMedia(item.id, { type: "audio", url, durationSec });
              setRecorder(null);
            }}
            onCancel={() => setRecorder(null)}
          />
        ) : recorder === "video" ? (
          <VideoInput
            kind="result"
            keyPrefix={draftKey}
            onComplete={({ url, durationSec }) => {
              addMedia(item.id, { type: "video", url, durationSec });
              setRecorder(null);
            }}
            onCancel={() => setRecorder(null)}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-x-4">
            <button
              type="button"
              disabled={mediaFull}
              onClick={() => setRecorder("audio")}
              className="inline-flex h-11 items-center gap-1.5 text-sm font-medium text-orange-700 hover:text-orange-800 disabled:opacity-40"
            >
              <Mic className="h-4 w-4" />
              音声を録る
            </button>
            <button
              type="button"
              disabled={mediaFull}
              onClick={() => setRecorder("video")}
              className="inline-flex h-11 items-center gap-1.5 text-sm font-medium text-orange-700 hover:text-orange-800 disabled:opacity-40"
            >
              <Video className="h-4 w-4" />
              動画を撮る
            </button>
            {mediaFull && (
              <span className="text-xs text-slate-400">
                メディアは1項目 {MAX_RESULT_MEDIA_PER_ITEM} 件までです
              </span>
            )}
          </div>
        )}

        {preview && <MediaLightbox media={preview} onClose={() => setPreview(null)} />}
      </div>

      {/* --- 共通コメント欄（text タイプ以外） --- */}
      {item.itemType !== "text" && (
        <div className="mt-5">
          {commentVisible ? (
            <div>
              <label
                className={`mb-1.5 block text-sm font-medium ${
                  commentRequired ? "text-red-700" : "text-slate-700"
                }`}
              >
                {commentLabel}
              </label>
              <textarea
                rows={3}
                value={a.text}
                onChange={(e) => setAns(item.id, { text: e.target.value })}
                placeholder={
                  commentRequired ? "理由を記入してください" : "気づいた点があれば記入"
                }
                className={`w-full rounded-xl border p-3 text-base focus:outline-none focus:ring-1 ${
                  commentRequired
                    ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                    : "border-slate-300 focus:border-orange-500 focus:ring-orange-500"
                }`}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAns(item.id, { commentOpen: true })}
              className="inline-flex h-11 items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              <MessageSquarePlus className="h-4 w-4" />
              コメントを追加
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ===== 最終確認画面 =====

function ConfirmScreen({
  items,
  evals,
  getAns,
  ngCount,
  incomplete,
  jumpTo,
  inspectionDate,
  setInspectionDate,
  inspectorName,
  onEditWorker,
  notes,
  setNotes,
  submitError,
  submitting,
  onRetry,
}: {
  items: InspectionItem[];
  evals: ItemEval[];
  getAns: (id: string) => AnswerDraft;
  ngCount: number;
  incomplete: Array<{ it: InspectionItem; i: number }>;
  jumpTo: (i: number) => void;
  inspectionDate: string;
  setInspectionDate: (v: string) => void;
  inspectorName: string;
  onEditWorker: () => void;
  notes: string;
  setNotes: (v: string) => void;
  submitError: string | null;
  submitting: boolean;
  onRetry: () => void;
}) {
  const [preview, setPreview] = useState<{ type: MediaType; url: string } | null>(null);
  return (
    <div>
      {/* 送付前の全体確認 */}
      <div className="mb-4">
        <h2 className="text-base font-bold text-slate-800">内容の確認（送付前）</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          この内容で<strong className="font-semibold text-slate-700">送付（申請）</strong>
          します。ご確認のうえ、画面下の「送付（申請）する」を押してください。項目をタップすると修正できます。
        </p>
      </div>

      {/* 送信エラー（下書きは保持済み） */}
      {submitError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="flex items-start gap-1.5 text-sm font-semibold text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {submitError}
          </p>
          <p className="mt-1 text-xs text-red-600">入力内容は下書きに保存されています。</p>
          <button
            type="button"
            onClick={onRetry}
            disabled={submitting}
            className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${submitting ? "animate-spin" : ""}`} />
            再送
          </button>
        </div>
      )}

      {/* 総合判定 */}
      <div
        className={`mb-4 rounded-2xl border p-5 text-center ${
          ngCount > 0 ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"
        }`}
      >
        {ngCount > 0 ? (
          <>
            <XCircle className="mx-auto mb-1 h-8 w-8 text-red-600" />
            <p className="text-xl font-bold text-red-700">NG あり（{ngCount}件）</p>
            <p className="mt-1 text-xs text-red-600">総合判定は NG として記録されます</p>
          </>
        ) : (
          <>
            <CheckCircle2 className="mx-auto mb-1 h-8 w-8 text-emerald-600" />
            <p className="text-xl font-bold text-emerald-700">すべて OK</p>
          </>
        )}
      </div>

      {/* 未入力の警告 */}
      {incomplete.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">未入力の項目があります</p>
          <ul className="mt-2 space-y-1">
            {incomplete.map(({ it, i }) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => jumpTo(i)}
                  className="text-sm font-medium text-amber-700 underline"
                >
                  {i + 1}. {it.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 記録の全体（項目ごと・写真/メディアはタップでプレビュー、見出しタップで修正） */}
      <div className="mb-2 text-xs font-semibold text-slate-500">点検項目（{items.length}件）</div>
      <ul className="mb-5 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {items.map((item, i) => {
          const ev = evals[i];
          const a = getAns(item.id);
          const ng = ev.effJudgment === "ng";
          const valueLabel =
            item.itemType === "numeric" && ev.numericValue != null
              ? `${ev.numericValue}${item.unit ? ` ${item.unit}` : ""}`
              : item.itemType === "text"
                ? a.text.trim() || "（未記入）"
                : "";
          const comment = item.itemType !== "text" ? a.text.trim() : "";
          return (
            <li key={item.id} className={ng ? "bg-red-50" : ""}>
              <div className="flex items-start gap-3 p-3">
                <span className="w-5 shrink-0 pt-0.5 text-xs text-slate-400">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => jumpTo(i)}
                    className="block w-full text-left"
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`text-sm font-medium ${ng ? "font-bold text-red-700" : "text-slate-800"}`}
                      >
                        {item.label}
                      </span>
                      <Pencil className="h-3 w-3 shrink-0 text-slate-300" />
                    </span>
                    {valueLabel && (
                      <span className="mt-0.5 block text-sm text-slate-700">{valueLabel}</span>
                    )}
                    {comment && (
                      <span className="mt-0.5 block whitespace-pre-wrap text-xs text-slate-500">
                        {comment}
                      </span>
                    )}
                  </button>

                  {/* 添付（写真・音声・動画）: タップでプレビュー */}
                  {(a.photoUrl || a.media.length > 0) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {a.photoUrl && (
                        <button
                          type="button"
                          onClick={() => setPreview({ type: "photo", url: a.photoUrl! })}
                          className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={a.photoUrl} alt="点検写真" className="h-full w-full object-cover" />
                        </button>
                      )}
                      {a.media.map((m, mi) => (
                        <button
                          key={`${m.url}-${mi}`}
                          type="button"
                          onClick={() => setPreview({ type: m.type, url: m.url })}
                          className="inline-flex h-14 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                        >
                          {m.type === "audio" ? (
                            <Volume2 className="h-4 w-4 text-orange-700" />
                          ) : m.type === "video" ? (
                            <Play className="h-4 w-4 text-orange-700" />
                          ) : (
                            <Camera className="h-4 w-4 text-orange-700" />
                          )}
                          {m.durationSec != null
                            ? formatDuration(m.durationSec)
                            : m.type === "video"
                              ? "動画"
                              : m.type === "audio"
                                ? "音声"
                                : "写真"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <span className="shrink-0 pt-0.5">
                  {ev.effJudgment === "ng" ? (
                    <span className="inline-flex items-center rounded-md bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 ring-1 ring-inset ring-red-600/20">
                      NG
                    </span>
                  ) : ev.effJudgment === "ok" ? (
                    <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                      OK
                    </span>
                  ) : ev.done ? (
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-inset ring-slate-500/20">
                      —
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                      未入力
                    </span>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {/* 点検日・点検者・全体メモ */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">点検日</label>
            <input
              type="date"
              value={inspectionDate}
              onChange={(e) => setInspectionDate(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-300 px-3 text-base focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="mb-1.5 flex items-center justify-between text-sm font-medium text-slate-700">
              点検者（作業者）
              <button
                type="button"
                onClick={onEditWorker}
                className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 hover:text-orange-800"
              >
                <Pencil className="h-3.5 w-3.5" />
                変更
              </button>
            </label>
            <div className="flex h-12 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-base text-slate-700">
              {inspectorName.trim() || "（未入力）"}
            </div>
          </div>
        </div>
        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            全体メモ（任意）
          </label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="点検全体の特記事項があれば記入"
            className="w-full rounded-xl border border-slate-300 p-3 text-base focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>
      </div>

      {preview && <MediaLightbox media={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

// ===== 作業者選択（点検開始前） =====

function WorkerSelectScreen({
  equipmentName,
  managementNo,
  procedureName,
  roster,
  value,
  onChange,
  onStart,
}: {
  equipmentName: string;
  managementNo: string;
  procedureName: string;
  roster: string[];
  value: string;
  onChange: (v: string) => void;
  onStart: () => void;
}) {
  // 作業者名簿があれば選択式。名簿に無い値（共有アカウント名など）は未選択として扱う。
  const selectValue = roster.includes(value.trim()) ? value.trim() : "";
  const canStart = roster.length > 0 ? selectValue.length > 0 : value.trim().length > 0;
  return (
    <div className="mx-auto max-w-md p-4 sm:p-6">
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
          <UserRound className="h-6 w-6" />
        </div>
        <h1 className="text-center text-lg font-bold text-slate-900">作業者を選択</h1>
        <p className="mt-1 text-center text-sm text-slate-500">
          {equipmentName}
          {managementNo && <span className="text-slate-400">（{managementNo}）</span>}
          <br />
          <span className="text-xs">{procedureName}</span>
        </p>

        {roster.length > 0 ? (
          <div className="mt-5">
            <label className="mb-1.5 block text-xs font-medium text-slate-500">作業者</label>
            <select
              value={selectValue}
              onChange={(e) => onChange(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              <option value="">選択してください</option>
              {roster.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-400">
              作業者は設定ページの「作業者管理」で登録できます。
            </p>
          </div>
        ) : (
          <div className="mt-5">
            <label className="mb-1.5 block text-xs font-medium text-slate-500">作業者名</label>
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="例: 山田 太郎"
              className="h-12 w-full rounded-xl border border-slate-300 px-3 text-base focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
        )}

        <button
          type="button"
          disabled={!canStart}
          onClick={onStart}
          className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-orange-700 text-lg font-bold text-white shadow-sm hover:bg-orange-800 disabled:opacity-40"
        >
          <ClipboardCheck className="h-6 w-6" />
          点検を開始する
        </button>
        {!canStart && (
          <p className="mt-2 text-center text-xs text-slate-400">
            作業者名を選択または入力してください
          </p>
        )}
      </div>
    </div>
  );
}
