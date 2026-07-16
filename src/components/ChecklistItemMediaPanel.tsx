"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Image as ImageIcon,
  Loader2,
  Mic,
  RotateCcw,
  Trash2,
  Video,
  X,
} from "lucide-react";
import type { ItemReferenceMedia, MediaType } from "@/lib/types";
import { MEDIA_TYPE_LABEL } from "@/lib/types";
import { MAX_REFERENCE_MEDIA_PER_ITEM } from "@/lib/mediaLimits";
import { compressImageFile } from "@/lib/imageCompress";
import { uploadMedia } from "@/lib/uploadMedia";
import {
  setItemSpotPhotoAction,
  addItemReferenceMediaAction,
  deleteItemReferenceMediaAction,
} from "@/lib/actions";
import AudioRecorder from "./AudioRecorder";
import VideoInput from "./VideoInput";

function fmtSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * 手順書エディタの項目ごとのメディア管理パネル。
 * - 点検箇所の写真（1枚）: 撮影/選択 → 圧縮 → uploadMedia → setItemSpotPhotoAction
 * - 正常見本（最大10件）: 写真 / 音声録音(AudioRecorder) / 動画撮影(VideoInput)
 *   → addItemReferenceMediaAction（{error?} 返し）
 */
export default function ChecklistItemMediaPanel({
  procedureId,
  itemId,
  spotPhotoUrl,
  media,
}: {
  procedureId: string;
  itemId: string;
  spotPhotoUrl: string | null;
  media: ItemReferenceMedia[];
}) {
  const router = useRouter();

  // ---- 箇所写真 ----
  const spotCameraRef = useRef<HTMLInputElement>(null);
  const spotLibraryRef = useRef<HTMLInputElement>(null);
  const [spotBusy, setSpotBusy] = useState(false);
  const [spotMsg, setSpotMsg] = useState("");
  const [spotError, setSpotError] = useState<string | null>(null);

  // ---- 見本 ----
  const refPhotoRef = useRef<HTMLInputElement>(null);
  const [addMode, setAddMode] = useState<"audio" | "video" | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canAdd = media.length < MAX_REFERENCE_MEDIA_PER_ITEM;

  async function uploadSpot(file: File) {
    setSpotError(null);
    setSpotBusy(true);
    setSpotMsg("画像を圧縮しています…");
    try {
      const compressed = await compressImageFile(file);
      setSpotMsg("アップロード中…");
      const { url } = await uploadMedia(compressed, {
        kind: "spot",
        mediaType: "image",
        scopeId: itemId,
      });
      await setItemSpotPhotoAction(itemId, procedureId, url);
      router.refresh();
    } catch (e) {
      setSpotError(e instanceof Error ? e.message : "アップロードに失敗しました");
    } finally {
      setSpotBusy(false);
      setSpotMsg("");
    }
  }

  function onPickSpot(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void uploadSpot(file);
  }

  async function deleteSpot() {
    if (!confirm("点検箇所の写真を削除しますか？")) return;
    setSpotError(null);
    setSpotBusy(true);
    try {
      await setItemSpotPhotoAction(itemId, procedureId, null);
      router.refresh();
    } catch (e) {
      setSpotError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setSpotBusy(false);
    }
  }

  async function registerMedia(input: {
    mediaType: MediaType;
    url: string;
    contentType?: string | null;
    sizeBytes?: number | null;
    durationSeconds?: number | null;
  }) {
    setAddError(null);
    try {
      const res = await addItemReferenceMediaAction({
        itemId,
        procedureId,
        mediaType: input.mediaType,
        url: input.url,
        contentType: input.contentType ?? null,
        sizeBytes: input.sizeBytes ?? null,
        durationSeconds: input.durationSeconds ?? null,
      });
      if (res?.error) {
        setAddError(res.error);
      } else {
        router.refresh();
      }
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setAddMode(null);
    }
  }

  async function onPickRefPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAddError(null);
    setPhotoBusy(true);
    try {
      const compressed = await compressImageFile(file);
      const { url } = await uploadMedia(compressed, {
        kind: "ref",
        mediaType: "photo",
        scopeId: itemId,
      });
      await registerMedia({
        mediaType: "photo",
        url,
        contentType: compressed.type || null,
        sizeBytes: compressed.size,
      });
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "アップロードに失敗しました");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function deleteRef(m: ItemReferenceMedia) {
    if (!confirm(`この${MEDIA_TYPE_LABEL[m.mediaType]}の見本を削除しますか？`)) return;
    setAddError(null);
    setDeletingId(m.id);
    try {
      await deleteItemReferenceMediaAction(m.id, procedureId);
      router.refresh();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ---- 点検箇所の写真 ---- */}
      <div>
        <div className="mb-1.5 text-xs font-medium text-slate-500">
          点検箇所の写真（どの部位を見るか・1枚）
        </div>
        <input
          ref={spotCameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPickSpot}
        />
        <input
          ref={spotLibraryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPickSpot}
        />
        {spotPhotoUrl ? (
          <div className="flex items-start gap-3">
            <a href={spotPhotoUrl} target="_blank" rel="noreferrer" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={spotPhotoUrl}
                alt="点検箇所の写真"
                className="h-24 w-24 rounded-lg border border-slate-200 object-cover"
              />
            </a>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={spotBusy}
                onClick={() => spotCameraRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                撮り直す
              </button>
              <button
                type="button"
                disabled={spotBusy}
                onClick={() => void deleteSpot()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                削除
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
            <button
              type="button"
              disabled={spotBusy}
              onClick={() => spotCameraRef.current?.click()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-orange-700 text-sm font-semibold text-white hover:bg-orange-800 disabled:opacity-50"
            >
              {spotBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              撮影する
            </button>
            <button
              type="button"
              disabled={spotBusy}
              onClick={() => spotLibraryRef.current?.click()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <ImageIcon className="h-4 w-4" />
              選択
            </button>
          </div>
        )}
        {spotBusy && spotMsg && <p className="mt-1.5 text-xs text-slate-500">{spotMsg}</p>}
        {spotError && <p className="mt-1.5 text-xs text-red-600">{spotError}</p>}
      </div>

      {/* ---- 正常見本 ---- */}
      <div>
        <div className="mb-1.5 text-xs font-medium text-slate-500">
          正常な状態の見本（写真・音声・動画、最大{MAX_REFERENCE_MEDIA_PER_ITEM}件）
        </div>

        {media.length > 0 && (
          <div className="mb-2 flex flex-wrap items-start gap-2">
            {media.map((m) => (
              <RefMediaChip
                key={m.id}
                media={m}
                busy={deletingId === m.id}
                onDelete={() => void deleteRef(m)}
              />
            ))}
          </div>
        )}

        <input
          ref={refPhotoRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void onPickRefPhoto(e)}
        />
        <div className="flex flex-wrap gap-2">
          <AddButton
            disabled={!canAdd || photoBusy}
            onClick={() => refPhotoRef.current?.click()}
          >
            {photoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            写真
          </AddButton>
          <AddButton
            disabled={!canAdd}
            active={addMode === "audio"}
            onClick={() => setAddMode(addMode === "audio" ? null : "audio")}
          >
            <Mic className="h-4 w-4" />
            音声を録音
          </AddButton>
          <AddButton
            disabled={!canAdd}
            active={addMode === "video"}
            onClick={() => setAddMode(addMode === "video" ? null : "video")}
          >
            <Video className="h-4 w-4" />
            動画を撮影
          </AddButton>
        </div>
        {!canAdd && (
          <p className="mt-1.5 text-xs text-slate-400">
            見本は1項目につき{MAX_REFERENCE_MEDIA_PER_ITEM}件までです
          </p>
        )}
        {photoBusy && <p className="mt-1.5 text-xs text-slate-500">写真をアップロードしています…</p>}

        {addMode === "audio" && (
          <div className="mt-2">
            <AudioRecorder
              kind="ref"
              keyPrefix={itemId}
              onCancel={() => setAddMode(null)}
              onComplete={(r) =>
                registerMedia({
                  mediaType: "audio",
                  url: r.url,
                  contentType: r.contentType ?? null,
                  sizeBytes: r.sizeBytes ?? null,
                  durationSeconds: r.durationSec,
                })
              }
            />
          </div>
        )}
        {addMode === "video" && (
          <div className="mt-2">
            <VideoInput
              kind="ref"
              keyPrefix={itemId}
              onCancel={() => setAddMode(null)}
              onComplete={(r) =>
                registerMedia({
                  mediaType: "video",
                  url: r.url,
                  contentType: r.contentType ?? null,
                  sizeBytes: r.sizeBytes,
                  durationSeconds: r.durationSec,
                })
              }
            />
          </div>
        )}

        {addError && <p className="mt-1.5 text-xs text-red-600">{addError}</p>}
      </div>
    </div>
  );
}

function AddButton({
  children,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-11 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium disabled:opacity-50 ${
        active
          ? "border-orange-300 bg-orange-50 text-orange-700"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

/** 見本メディアのチップ。写真=サムネ、音声/動画=タップでインライン再生。 */
function RefMediaChip({
  media: m,
  busy,
  onDelete,
}: {
  media: ItemReferenceMedia;
  busy: boolean;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (m.mediaType === "photo") {
    return (
      <div className="relative">
        <a href={m.url} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={m.url}
            alt={m.caption ?? "見本写真"}
            className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
          />
        </a>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          aria-label="見本写真を削除"
          className="absolute -right-1.5 -top-1.5 rounded-full border border-slate-200 bg-white p-1 text-slate-400 shadow-sm hover:text-red-500 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
        </button>
      </div>
    );
  }

  const icon = m.mediaType === "audio" ? "🔊" : "🎬";
  return (
    <div className="flex w-full flex-col gap-1.5 sm:w-auto">
      <div className="inline-flex w-fit items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-orange-800"
        >
          <span aria-hidden>{icon}</span>
          {MEDIA_TYPE_LABEL[m.mediaType]}
          {m.durationSeconds != null && (
            <span className="font-mono text-slate-400">{fmtSec(m.durationSeconds)}</span>
          )}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          aria-label="見本を削除"
          className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>
      {open &&
        (m.mediaType === "audio" ? (
          <audio controls src={m.url} className="h-9 w-full max-w-xs" />
        ) : (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            controls
            playsInline
            src={m.url}
            className="max-h-40 w-full max-w-xs rounded-lg border border-slate-200 bg-black"
          />
        ))}
    </div>
  );
}
