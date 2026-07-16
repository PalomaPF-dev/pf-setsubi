import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createReadStream } from "fs";
import { promises as fs } from "fs";
import path from "path";
import { Readable } from "stream";
import { authOptions } from "@/lib/authOptions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * ローカルストレージ（オンプレ版）のファイル配信。
 * URL 形式: /api/files/<companyId>/<...key>
 * - セッション必須 + 先頭セグメント（companyId）一致のテナント認可
 *   → クラウド版の「推測不能な公開URL」より強い、ログイン必須の配信になる
 * - <img>・リンクは同一オリジン参照なのでクッキーが自動で乗る（印刷ページ含む）
 */

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  // 音声・動画（点検の見本/記録メディア）
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  m4a: "audio/mp4",
  weba: "audio/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

export async function GET(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const session = await getServerSession(authOptions);
  const companyId = session?.user?.companyId;
  // 未ログインは 404（存在秘匿）
  if (!companyId) return new NextResponse(null, { status: 404 });

  const { path: rawSegments } = await ctx.params;
  if (!rawSegments || rawSegments.length < 2) {
    return new NextResponse(null, { status: 404 });
  }

  // パストラバーサル対策（1段目: セグメント検査）
  const segments: string[] = [];
  for (const raw of rawSegments) {
    let seg: string;
    try {
      seg = decodeURIComponent(raw);
    } catch {
      return new NextResponse(null, { status: 400 });
    }
    if (!seg || seg === "." || seg === ".." || /[/\\\0]/.test(seg)) {
      return new NextResponse(null, { status: 400 });
    }
    segments.push(seg);
  }

  // テナント認可: 先頭セグメントが自社 companyId でなければ 404
  if (segments[0] !== companyId) return new NextResponse(null, { status: 404 });

  const custom = process.env.STORAGE_DIR;
  const baseDir = custom
    ? path.resolve(/*turbopackIgnore: true*/ custom)
    : path.join(process.cwd(), "data", "uploads");
  const filePath = path.resolve(/*turbopackIgnore: true*/ baseDir, ...segments);
  // パストラバーサル対策（2段目: 解決後のプレフィックス検査）
  if (!filePath.startsWith(baseDir + path.sep)) {
    return new NextResponse(null, { status: 400 });
  }

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return new NextResponse(null, { status: 404 });

    const ext = path.extname(filePath).slice(1).toLowerCase();
    const contentType = CONTENT_TYPES[ext];
    const headers: Record<string, string> = {
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
      // iOS Safari の <video>/<audio> は Range 対応がないと再生できない
      "Accept-Ranges": "bytes",
    };
    if (contentType) {
      headers["Content-Type"] = contentType;
    } else {
      // ホワイトリスト外は inline 表示させない（同一オリジンでの stored XSS 防止）
      headers["Content-Type"] = "application/octet-stream";
      headers["Content-Disposition"] = "attachment";
    }

    // Range リクエスト（bytes=start-end）
    const range = req.headers.get("range");
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (!m || (m[1] === "" && m[2] === "")) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${stat.size}` },
        });
      }
      let start: number;
      let end: number;
      if (m[1] === "") {
        // suffix range: 末尾 N バイト
        const suffix = Math.min(parseInt(m[2], 10), stat.size);
        start = stat.size - suffix;
        end = stat.size - 1;
      } else {
        start = parseInt(m[1], 10);
        end = m[2] === "" ? stat.size - 1 : Math.min(parseInt(m[2], 10), stat.size - 1);
      }
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= stat.size) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${stat.size}` },
        });
      }
      headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
      headers["Content-Length"] = String(end - start + 1);
      const stream = Readable.toWeb(
        createReadStream(filePath, { start, end })
      ) as ReadableStream;
      return new Response(stream, { status: 206, headers });
    }

    headers["Content-Length"] = String(stat.size);
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
    return new Response(stream, { status: 200, headers });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
