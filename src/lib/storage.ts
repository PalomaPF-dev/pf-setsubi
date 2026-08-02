import { promises as fs } from "fs";
import path from "path";

/**
 * ファイルストレージ抽象。
 * - クラウド版: Vercel Blob（access: public、推測不能 URL）
 * - オンプレ版: ローカルファイルシステム + /api/files/ の認証付き配信
 * 選択は STORAGE_DRIVER 明示 > BLOB_READ_WRITE_TOKEN の有無。env が無ければ現行動作。
 *
 * 社内共通の統一 Blob Store（sumakouba-shared-blob 等）に複数アプリを接続する運用に伴い、
 * このアプリが書き込む全キーの先頭に APP_PREFIX を付与する。他アプリ（hinshitsu/kanagata/keisoku等）
 * と同一 Store を共有してもパスが衝突しないようにするための区画分け。
 * クライアント直接アップロード（uploadMedia.ts）側でも同じ APP_PREFIX を使うこと。
 */
export const APP_PREFIX = "setsubi";

export interface SaveFileOpts {
  /** local ドライバのテナント分離・認可キー（vercel-blob では未使用） */
  companyId: string;
  /** ドライバ相対キー。例 "equipment/<eqId>/<ts>_<name>"（現行の Blob パスと同一文字列を渡す） */
  key: string;
  file: File | Blob;
  contentType?: string | null;
}

export interface Storage {
  /** 戻り値 url を DB（blob_url / photo_url）へそのまま保存する */
  saveFile(opts: SaveFileOpts): Promise<{ url: string }>;
  /** DB に保存された URL 群を削除（失敗は握り潰してログのみ — 業務データは既に消えているため） */
  deleteFiles(urls: string[]): Promise<void>;
}

type DriverName = "vercel-blob" | "local";

function resolveDriver(): DriverName {
  const explicit = process.env.STORAGE_DRIVER;
  if (explicit === "vercel-blob" || explicit === "local") return explicit;
  return process.env.BLOB_READ_WRITE_TOKEN ? "vercel-blob" : "local";
}

/**
 * アップロード可能な設定か。
 * Vercel 上で Blob トークン未設定のまま local に落ちるのは事故（エフェメラルFSで消える）
 * なので未設定扱いにする。
 */
export function isStorageConfigured(): boolean {
  const driver = resolveDriver();
  if (driver === "vercel-blob") return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  return !process.env.VERCEL;
}

/**
 * 大容量メディアのアップロード方式。
 * - client-blob: @vercel/blob/client でブラウザ→Blob 直接アップロード（Vercel の 4.5MB 制限を回避）
 * - server-multipart: Route Handler へ multipart 直送（オンプレ standalone は 4.5MB 制限なし）
 */
export type UploadMode = "client-blob" | "server-multipart";

export function getUploadMode(): UploadMode {
  return resolveDriver() === "vercel-blob" ? "client-blob" : "server-multipart";
}

/**
 * 保存済みメディア URL が自社のものとして妥当か（Server Action がクライアント申告の URL を
 * DB に格納する前の検証。javascript: や他社パスの混入を遮断する）。
 */
export function isOwnMediaUrl(url: string, companyId: string): boolean {
  if (url.startsWith(`/api/files/${companyId}/`)) return true; // local ドライバ
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !u.hostname.endsWith(".public.blob.vercel-storage.com")) {
      return false;
    }
    // 全テナント・全アプリが同一 Blob ストアを共有するため、ホスト名だけでは他社/他アプリの
    // URL を弾けない。アップロード発行時（/api/upload/media の onBeforeGenerateToken）が
    // pathname を必ず `<APP_PREFIX>/media/<companyId>/...` にしているので、読み取り側もパスで
    // 確認する。プレフィックス無しの旧パスは、社内Store統一（アプリ単位のプレフィックス導入）
    // より前にアップロード済みの既存ファイルを弾かないための後方互換。
    const path = u.pathname.replace(/^\//, "");
    return (
      path.startsWith(`${APP_PREFIX}/media/${companyId}/`) ||
      path.startsWith(`${APP_PREFIX}/inspection/${companyId}/`) ||
      path.startsWith(`media/${companyId}/`) || // 旧パス（Store統一前）
      path.startsWith(`inspection/${companyId}/`) // 旧パス（Store統一前）
    );
  } catch {
    return false;
  }
}

function storageDir(): string {
  // STORAGE_DIR は実行時にのみ評価（オンプレ用）。既定は静的スコープの ./data/uploads。
  const custom = process.env.STORAGE_DIR;
  if (custom) return path.resolve(/*turbopackIgnore: true*/ custom);
  return path.join(process.cwd(), "data", "uploads");
}

/** key の各セグメントを再サニタイズ（パストラバーサル・不正文字の遮断） */
function sanitizeKey(key: string): string {
  return key
    .split("/")
    .map((seg) => seg.replace(/[^\w.\-]/g, "_"))
    .filter((seg) => seg !== "" && seg !== "." && seg !== "..")
    .join("/");
}

const vercelBlobDriver: Storage = {
  async saveFile({ key, file }) {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      throw new Error("Blob ストレージ未設定です（BLOB_READ_WRITE_TOKEN）。Vercel Blob を接続してください。");
    }
    const { put } = await import("@vercel/blob");
    const blob = await put(`${APP_PREFIX}/${key}`, file, { access: "public", token });
    return { url: blob.url };
  },
  async deleteFiles(urls) {
    if (urls.length === 0 || !process.env.BLOB_READ_WRITE_TOKEN) return;
    try {
      const { del } = await import("@vercel/blob");
      await del(urls, { token: process.env.BLOB_READ_WRITE_TOKEN });
    } catch (e) {
      console.error("[storage] blob delete failed:", e);
    }
  },
};

const localDriver: Storage = {
  async saveFile({ companyId, key, file }) {
    if (process.env.VERCEL) {
      // Vercel のエフェメラルFSに書くと静かにデータ消失するため、現行と同じエラーで止める
      throw new Error("Blob ストレージ未設定です（BLOB_READ_WRITE_TOKEN）。Vercel Blob を接続してください。");
    }
    const safeKey = sanitizeKey(key);
    const filePath = path.join(/*turbopackIgnore: true*/ storageDir(), companyId, safeKey);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buf);
    return { url: `/api/files/${companyId}/${safeKey}` };
  },
  async deleteFiles(urls) {
    for (const url of urls) {
      try {
        if (url.startsWith("/api/files/")) {
          const rel = url.slice("/api/files/".length);
          const safe = sanitizeKey(rel);
          await fs.unlink(path.join(/*turbopackIgnore: true*/ storageDir(), safe)).catch((e) => {
            if (e?.code !== "ENOENT") throw e;
          });
        } else if (url.startsWith("https://") && process.env.BLOB_READ_WRITE_TOKEN) {
          // クラウド→オンプレ移行でデータに Blob URL が混在していても消せるように
          const { del } = await import("@vercel/blob");
          await del([url], { token: process.env.BLOB_READ_WRITE_TOKEN });
        }
      } catch (e) {
        console.error("[storage] local delete failed:", url, e);
      }
    }
  },
};

export function getStorage(): Storage {
  return resolveDriver() === "vercel-blob" ? vercelBlobDriver : localDriver;
}
