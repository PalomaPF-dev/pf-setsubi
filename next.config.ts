import type { NextConfig } from "next";

// 通常の SSR ビルド（Vercel）。iOS は Capacitor のリモート読込でこのライブサイトを表示する。
// オンプレ Docker ビルド時のみ BUILD_STANDALONE=1 で standalone 出力（クラウドビルドには影響しない）。
const nextConfig: NextConfig = {
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  // 共通UIパッケージは TSX をそのまま配布しているためトランスパイルする
  transpilePackages: ["@paloma-pf/ui"],
  turbopack: {
    root: __dirname,
  },
  experimental: {
    serverActions: {
      // 添付アップロード（写真はクライアント側で圧縮するが、PDF等の保険として引き上げ）
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
