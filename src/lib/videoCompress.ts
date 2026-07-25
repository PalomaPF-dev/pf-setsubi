"use client";

import {
  VIDEO_TARGET_MAX_EDGE,
  VIDEO_TARGET_BITRATE,
  VIDEO_TARGET_AUDIO_BITRATE,
  VIDEO_TARGET_FPS,
} from "./mediaLimits";

/**
 * 撮影動画をアップロード前に再エンコードして通信量を落とす（クライアント専用）。
 *
 * スマホのカメラは 1080p / 10Mbps 超で録るため、電波の弱い現場では 5 秒の動画でも
 * アップロードに数十秒かかる。長辺 VIDEO_TARGET_MAX_EDGE px・VIDEO_TARGET_BITRATE bps へ
 * 落として送ることで、実測でおおむね 1/5〜1/10 の転送量になる。
 *
 * 方式: <video> を等速再生しながら縮小した canvas へ描画し、その canvas ストリームを
 * MediaRecorder で録り直す。音声は「異音の確認」に使うため必ず残す必要があり、
 * HTMLMediaElement.captureStream() は Safari で使えないので Web Audio
 * （MediaElementAudioSource → MediaStreamAudioDestination）で取り出す。
 *
 * 再生と同じだけ時間がかかる（5秒の動画なら約5秒）。動画は30秒までなので許容範囲。
 * 途中で失敗した場合・圧縮後の方が大きい場合は必ず元ファイルを返す（アップロードは止めない）。
 */
export async function compressVideoFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<File> {
  if (!file.type.startsWith("video/")) return file;
  if (typeof MediaRecorder === "undefined") return file;

  const mimeType = pickMimeType();
  if (!mimeType) return file;

  let objectUrl: string | null = null;
  let video: HTMLVideoElement | null = null;
  let audioCtx: AudioContext | null = null;
  let stream: MediaStream | null = null;

  try {
    objectUrl = URL.createObjectURL(file);
    video = document.createElement("video");
    video.src = objectUrl;
    video.playsInline = true;
    video.preload = "auto";
    // Safari は DOM に無い要素の再生を拒むことがあるため、見えない状態で挿入する
    video.style.cssText =
      "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
    document.body.appendChild(video);

    // iOS は「ユーザー操作の直後」でないと音声つき再生を拒む。タップ直後のこの時点で
    // 一度 play→pause して要素を再生済みにしておくと、準備後の再生が通る。
    // 失敗しても後段の play() を試すだけなので握り潰す。
    void video
      .play()
      .then(() => video?.pause())
      .catch(() => {});

    await onceReady(video);
    video.currentTime = 0;

    const srcW = video.videoWidth;
    const srcH = video.videoHeight;
    if (!srcW || !srcH) return file;

    const scale = Math.min(1, VIDEO_TARGET_MAX_EDGE / Math.max(srcW, srcH));
    // エンコーダの都合で幅・高さは偶数に揃える
    const w = Math.max(2, Math.round((srcW * scale) / 2) * 2);
    const h = Math.max(2, Math.round((srcH * scale) / 2) * 2);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    if (typeof canvas.captureStream !== "function") return file;
    stream = canvas.captureStream(VIDEO_TARGET_FPS);

    // 音声トラックを Web Audio 経由で取り出して合成する（取れなければ映像のみ）
    audioCtx = attachAudioTrack(video, stream);

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: VIDEO_TARGET_BITRATE,
      audioBitsPerSecond: VIDEO_TARGET_AUDIO_BITRATE,
    });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const done = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => resolve();
    });

    recorder.start();
    drawLoop(video, ctx, w, h, onProgress);
    await video.play();

    await Promise.race([
      new Promise<void>((resolve) => {
        video!.onended = () => resolve();
      }),
      // 保険: 再生が止まったまま終わらない場合に備えて尺＋5秒で打ち切る
      sleep((Number.isFinite(video.duration) ? video.duration : 30) * 1000 + 5000),
    ]);

    if (recorder.state !== "inactive") recorder.stop();
    await done;

    const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
    // 圧縮の意味が無い（同等以上に太った）場合は元ファイルを使う
    if (blob.size === 0 || blob.size >= file.size) return file;

    const ext = blob.type === "video/mp4" ? "mp4" : "webm";
    const name = file.name.replace(/\.[^.]+$/, "") + `.${ext}`;
    return new File([blob], name, { type: blob.type });
  } catch {
    return file;
  } finally {
    if (video) {
      video.pause();
      video.onended = null;
      video.remove();
    }
    stream?.getTracks().forEach((t) => t.stop());
    void audioCtx?.close().catch(() => {});
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

/** MediaRecorder が扱える形式を選ぶ。iOS Safari は mp4、他は webm。 */
function pickMimeType(): string | null {
  const candidates = [
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

/** メタデータとデコードの準備が整うまで待つ。 */
function onceReady(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 2) return resolve();
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("動画を読み込めませんでした"));
  });
}

/**
 * 元動画の音声を canvas ストリームへ合流させる。
 * ctx.destination には繋がないので、圧縮中にスピーカーから音は出ない。
 * 音声が無い／取り出せない端末では何もしない（映像のみで続行）。
 */
function attachAudioTrack(video: HTMLVideoElement, stream: MediaStream): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    void ctx.resume().catch(() => {});
    const source = ctx.createMediaElementSource(video);
    const dest = ctx.createMediaStreamDestination();
    source.connect(dest);
    const track = dest.stream.getAudioTracks()[0];
    if (track) stream.addTrack(track);
    return ctx;
  } catch {
    return null;
  }
}

/** 再生に合わせて縮小描画を続ける（進捗も報告する）。 */
function drawLoop(
  video: HTMLVideoElement,
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  onProgress?: (percent: number) => void
): void {
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
  const report = () => {
    if (onProgress && duration) {
      onProgress(Math.min(99, Math.round((video.currentTime / duration) * 100)));
    }
  };

  // requestVideoFrameCallback があれば実フレームに同期して描ける（無ければ rAF）
  const rvfc = (
    video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    }
  ).requestVideoFrameCallback?.bind(video);

  const step = () => {
    if (video.ended || video.paused) return;
    ctx.drawImage(video, 0, 0, w, h);
    report();
    if (rvfc) rvfc(step);
    else requestAnimationFrame(step);
  };
  if (rvfc) rvfc(step);
  else requestAnimationFrame(step);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
