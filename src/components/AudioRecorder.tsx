"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, RotateCcw, Check, Loader2 } from "lucide-react";
import { uploadMedia } from "@/lib/uploadMedia";
import { AUDIO_MAX_SECONDS } from "@/lib/mediaLimits";

/** 録音完了時に親へ渡す結果（url は アップロード済み URL）。 */
export interface AudioRecorderResult {
  url: string;
  durationSec: number;
  contentType?: string;
  sizeBytes?: number;
}

type RecState = "idle" | "recording" | "preview" | "uploading" | "done" | "error";

/** iOS Safari の MediaRecorder は audio/mp4 のみ。Chrome/Android は webm(opus)。 */
const MIME_CANDIDATES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];

function fmtSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * 音声録音 → プレビュー → アップロードの一体コンポーネント。
 * MediaRecorder で最大60秒。アップロードは uploadMedia（クラウド/オンプレ自動判別）。
 * 完了で onComplete({url, durationSec, ...}) を await する（DB 登録は親の責務）。
 */
export default function AudioRecorder({
  onComplete,
  onCancel,
  keyPrefix,
  kind,
}: {
  onComplete: (result: AudioRecorderResult) => void | Promise<void>;
  onCancel: () => void;
  /** アップロード先パスのスコープ（itemId / draftKey など） */
  keyPrefix: string;
  kind: "ref" | "result";
}) {
  const [state, setState] = useState<RecState>("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);

  function clearTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function releaseStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  // アンマウント時の後始末（マイク解放・タイマー停止・objectURL破棄）
  useEffect(() => {
    return () => {
      clearTimer();
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        try {
          rec.stop();
        } catch {
          /* noop */
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  function discardPreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    blobRef.current = null;
  }

  async function start() {
    setMicError(null);
    setUploadError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMicError("このブラウザは録音に対応していません");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicError(
        "マイクを使用できません。ブラウザのマイク許可の設定と、HTTPS で接続しているかを確認してください"
      );
      return;
    }
    discardPreview();

    const mime = MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
    let recorder: MediaRecorder;
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setMicError("このブラウザは録音に対応していません");
      return;
    }
    chunksRef.current = [];
    durationRef.current = 0;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      clearTimer();
      releaseStream();
      // codecs 付き mimeType はサーバーのホワイトリストに合わせて base type に正規化
      const base = (recorder.mimeType || mime || "audio/webm").split(";")[0].trim().toLowerCase();
      const blob = new Blob(chunksRef.current, { type: base });
      if (blob.size === 0) {
        setMicError("録音できませんでした。もう一度お試しください");
        setState("idle");
        return;
      }
      blobRef.current = blob;
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setState("preview");
    };
    recorderRef.current = recorder;
    streamRef.current = stream;
    recorder.start();

    const startedAt = Date.now();
    setElapsed(0);
    clearTimer();
    timerRef.current = setInterval(() => {
      const sec = Math.floor((Date.now() - startedAt) / 1000);
      durationRef.current = Math.min(sec, AUDIO_MAX_SECONDS);
      setElapsed(Math.min(sec, AUDIO_MAX_SECONDS));
      if (sec >= AUDIO_MAX_SECONDS) stopRecording(); // 上限で自動停止
    }, 250);
    setState("recording");
  }

  function stopRecording() {
    clearTimer();
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        releaseStream();
      }
    } else {
      releaseStream();
    }
  }

  async function upload() {
    const blob = blobRef.current;
    if (!blob) return;
    setUploadError(null);
    setProgress(0);
    setState("uploading");
    try {
      const { url } = await uploadMedia(blob, {
        kind,
        mediaType: "audio",
        scopeId: keyPrefix,
        onProgress: setProgress,
      });
      setState("done");
      await onComplete({
        url,
        durationSec: Math.max(1, durationRef.current),
        contentType: blob.type || undefined,
        sizeBytes: blob.size,
      });
    } catch (e) {
      setState("error");
      setUploadError(e instanceof Error ? e.message : "アップロードに失敗しました");
    }
  }

  function retake() {
    setUploadError(null);
    discardPreview();
    void start();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      {state === "idle" && (
        <div className="flex flex-col gap-2">
          {micError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
              {micError}
            </div>
          )}
          <button
            type="button"
            onClick={() => void start()}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-orange-700 text-sm font-semibold text-white hover:bg-orange-800"
          >
            <Mic className="h-5 w-5" />
            録音を開始
          </button>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">音声は{AUDIO_MAX_SECONDS}秒まで録音できます</span>
            <button
              type="button"
              onClick={onCancel}
              className="text-xs font-medium text-slate-500 underline hover:text-slate-700"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {state === "recording" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" aria-hidden />
            <span className="text-sm font-semibold text-slate-800">録音中</span>
            <span className="ml-auto font-mono text-sm text-slate-600">
              {fmtSec(elapsed)} / {fmtSec(AUDIO_MAX_SECONDS)}
            </span>
          </div>
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700"
          >
            <Square className="h-4 w-4 fill-current" />
            録音を停止
          </button>
          <p className="text-xs text-slate-400">{AUDIO_MAX_SECONDS}秒で自動的に停止します</p>
        </div>
      )}

      {state === "preview" && previewUrl && (
        <div className="flex flex-col gap-2">
          <audio controls src={previewUrl} className="h-10 w-full" />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={retake}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" />
              録り直す
            </button>
            <button
              type="button"
              onClick={() => void upload()}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-orange-700 text-sm font-semibold text-white hover:bg-orange-800"
            >
              <Check className="h-4 w-4" />
              この音声を使う
            </button>
          </div>
        </div>
      )}

      {state === "uploading" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            アップロード中… {progress}%
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-orange-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {state === "done" && (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          登録しています…
        </div>
      )}

      {state === "error" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-red-600">{uploadError}</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={retake}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" />
              録り直す
            </button>
            <button
              type="button"
              onClick={() => void upload()}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-orange-700 text-sm font-semibold text-white hover:bg-orange-800"
            >
              再試行
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
