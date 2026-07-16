# syntax=docker/dockerfile:1
# =============================================================================
# スマコウバ設備 オンプレ版 Dockerfile（3ステージビルド）
#   deps    : 依存パッケージのインストール（package*.json のみで層キャッシュ）
#   builder : BUILD_STANDALONE=1 で Next.js standalone ビルド
#   runner  : 実行用の最小イメージ（node ユーザーで実行）
# =============================================================================

# ---- Stage 1: deps ----------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---- Stage 2: builder -------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV BUILD_STANDALONE=1
ENV NEXT_TELEMETRY_DISABLED=1
# ビルド時にもオンプレ扱いにする: 静的プリレンダされる /pricing のリダイレクトを
# ビルド成果物に焼き込むため（動的ページは実行時の compose 環境変数で判定される）
ENV ON_PREMISE=1
RUN npm run build

# ---- Stage 3: runner --------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

# タイムゾーンデータ（TZ=Asia/Tokyo を有効にするため）
RUN apk add --no-cache tzdata

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV TZ=Asia/Tokyo
ENV NEXT_TELEMETRY_DISABLED=1

# standalone 出力一式と静的アセット（このプロジェクトに public/ は無い）
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# アップロード保存先（compose の named volume をここへマウント）
RUN mkdir -p /data/uploads && chown -R node:node /data/uploads

USER node
EXPOSE 3000

CMD ["node", "server.js"]
