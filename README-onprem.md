# スマコウバ設備 オンプレミス版 セットアップガイド

社内サーバー（Docker）で「スマコウバ設備」を運用するための手順書です。
クラウド版（Vercel）とコードは共通で、Docker でビルド・起動するだけで
オンプレ向けの構成（課金なし・ファイルはサーバー内保存・SMTP メール）に切り替わります。

---

## 構成概要

```
社内のブラウザ / iPhone(Safari)
        │  http://<SERVER_HOST>:8080
        ▼
┌─────────────────────────── Docker (docker compose) ───────────────────────────┐
│                                                                                │
│  ┌─────────────┐  ポート 8080→3000   ┌──────────────────┐                      │
│  │  app         │◄────────────────── │ （ホストの 8080）  │                      │
│  │  Next.js     │                    └──────────────────┘                      │
│  │              │──── SQL ────► ┌──────────────┐                               │
│  │              │               │ db            │                              │
│  │              │               │ PostgreSQL 16 │── volume: db-data（台帳データ）│
│  │              │               └──────────────┘                               │
│  │              │──── 添付保存 ──► volume: uploads（写真・PDF /data/uploads）    │
│  └─────▲───────┘                                                               │
│        │ 毎日 9:00 に HTTP で呼び出し（Bearer 認証）                              │
│  ┌─────┴───────┐                                                               │
│  │  cron        │  busybox crond（app と同じイメージのサイドカー）                │
│  └─────────────┘                                                               │
└────────────────────────────────────────────────────────────────────────────────┘
```

- **app** … アプリ本体。データベースのスキーマは初回アクセス時に自動作成されます（マイグレーション作業は不要）。
- **db** … PostgreSQL。データは Docker の named volume `db-data` に永続化されます。
- **cron** … 点検期限アラート（メール通知）を毎日定時に実行するだけの小さなコンテナです。
- **uploads** … 設備写真・取扱説明書 PDF などの添付ファイルの保存先 volume です。

## 必要要件

- **Docker Engine ＋ Docker Compose v2**（`docker compose` コマンドが使えること）
  - Linux サーバー推奨。Windows/Mac の Docker Desktop でも動作します。
- メモリ 2GB 以上を推奨（ビルド時に一時的に多く使います）
- サーバーには **固定 IP アドレス**（または社内 DNS のホスト名）を割り当ててください。
  ログイン処理が `NEXTAUTH_URL` の URL と一致している必要があるため、IP が変わると不具合の原因になります。

## 初回セットアップ

プロジェクト一式をサーバーに配置（`git clone` や zip 展開）した後、そのディレクトリで実行します。

```bash
# 1. 環境設定ファイルを作成
cp .env.onprem.example .env

# 2. 秘密情報を生成して .env に貼り付け（各行の値を埋める）
openssl rand -hex 32      # → POSTGRES_PASSWORD
openssl rand -base64 32   # → NEXTAUTH_SECRET
openssl rand -base64 32   # → CRON_SECRET

# 3. SERVER_HOST にサーバーの固定 IP かホスト名を設定（例: 192.168.1.50）
#    （SMTP_* は後からでも設定できます — 下記「SMTP 設定」参照）

# 4. ビルドして起動（初回は数分かかります）
docker compose up -d --build

# 5. 起動確認
docker compose ps          # app / db / cron が Up になっていること
docker compose logs -f app # 起動ログの確認（Ctrl+C で抜ける）
```

ブラウザで **`http://<SERVER_HOST>:8080/register`** を開き、会社アカウントと管理者ユーザーを作成してください。
以降のユーザーはアプリ内の「ユーザー管理」から追加できます。

> データベースのテーブルは最初のアクセス時に自動作成されます。特別な初期化コマンドは不要です。

## SMTP 設定（点検期限アラートメール）

社内のメールサーバー、またはメールプロバイダの SMTP を `.env` に設定します。

```ini
SMTP_HOST=mail.example.co.jp
SMTP_PORT=587          # 587=STARTTLS が一般的 / 465=SMTPS なら SMTP_SECURE=1
SMTP_USER=setsubi@example.co.jp
SMTP_PASS=（パスワード）
SMTP_SECURE=0          # 465 を使う場合のみ 1
MAIL_FROM=設備管理 <setsubi@example.co.jp>
```

変更後は反映のため再作成します。

```bash
docker compose up -d
```

`SMTP_HOST` が未設定の間は、アラートメールの送信は静かにスキップされます（アプリの他の機能には影響しません）。

## 点検期限アラートの仕組みと実行時刻の変更

- `cron` コンテナが **毎日 9:00（日本時間）** に、アプリの
  `/api/cron/inspection-alert` を Bearer 認証（`CRON_SECRET`）付きで呼び出します。
- アプリは点検期限の **30日前・7日前・1日前**（`ALERT_LEAD_DAYS=30,7,1`）と **期限超過** の設備を集計し、
  会社の全ユーザーへメールを送信します。休止中・廃止の設備は対象外です。

実行時刻を変えたい場合は `docker/cron/entrypoint.sh` の crontab 行を編集します。

```sh
# 「分 時 日 月 曜日」の順。例: 毎日 7:30 に変える場合
30 7 * * * wget -qO- --header="Authorization: Bearer $CRON_SECRET" http://app:3000/api/cron/inspection-alert
```

タイムゾーンはコンテナに `TZ=Asia/Tokyo` を設定してあるため、**日本時間でそのまま指定**できます。
編集後は次で反映します。

```bash
docker compose restart cron
```

## 動作確認（アラートの手動実行）

定時を待たずに、その場でアラート処理を実行して確認できます。

```bash
docker compose exec cron sh -c \
  'wget -qO- --header="Authorization: Bearer $CRON_SECRET" http://app:3000/api/cron/inspection-alert'
```

`{"ok":true,...}` のような JSON が返れば成功です（`mailsSent` が送信通数）。
cron コンテナの実行履歴は `docker compose logs -f cron` で確認できます。

## バックアップとリストア

バックアップ対象は次の 2 つです。定期実行（サーバーの cron 等）と外部媒体への退避を推奨します。

| 対象 | 内容 | 保存場所 |
|---|---|---|
| データベース | 設備台帳・点検記録・ユーザーなど全業務データ | volume `db-data` |
| アップロード | 設備写真・PDF などの添付ファイル | volume `uploads` |

### バックアップ

```bash
# 1) データベース（SQL ダンプ）
docker compose exec db pg_dump -U setsubi setsubi > backup-$(date +%Y%m%d).sql

# 2) アップロードファイル（volume を tar.gz に固める）
#    ※ volume 名の先頭「sumakouba-setsubi_」はフォルダ名により変わることがあります。
#      docker volume ls で実際の名前を確認してください。
docker run --rm \
  -v sumakouba-setsubi_uploads:/data:ro \
  -v "$PWD":/backup \
  alpine tar czf /backup/uploads-$(date +%Y%m%d).tar.gz -C /data .
```

`.env`（秘密情報）も安全な場所に控えておいてください。`NEXTAUTH_SECRET` や `POSTGRES_PASSWORD` を失うと復元が面倒になります。

### リストア

新しいサーバー（または初期化後のサーバー）で、プロジェクト一式と `.env` を配置してから実行します。

```bash
# 0) コンテナを起動しておく（db が必要。app はいったん止める）
docker compose up -d db
docker compose stop app cron

# 1) データベースを空にして SQL ダンプを流し込む
docker compose exec db psql -U setsubi -d postgres -c "DROP DATABASE IF EXISTS setsubi;"
docker compose exec db psql -U setsubi -d postgres -c "CREATE DATABASE setsubi OWNER setsubi;"
cat backup-YYYYMMDD.sql | docker compose exec -T db psql -U setsubi -d setsubi

# 2) アップロードファイルを volume に展開
docker run --rm \
  -v sumakouba-setsubi_uploads:/data \
  -v "$PWD":/backup \
  alpine sh -c "cd /data && tar xzf /backup/uploads-YYYYMMDD.tar.gz"

# 3) アプリを起動
docker compose up -d
```

## アップデート手順

新しいバージョンのコードを取得してビルドし直すだけです。データ（db-data / uploads）はそのまま引き継がれます。

```bash
# 1) 最新コードを取得（git 管理の場合。zip 配布ならファイルを上書き）
git pull

# 2) イメージを再ビルド
docker compose build

# 3) 新イメージで再作成（数秒〜十数秒の停止が発生します）
docker compose up -d

# 4) 確認
docker compose ps
docker compose logs -f app
```

データベースのスキーマ変更が含まれる場合も、初回アクセス時に自動で追随します。

## HTTPS 化（任意）

社内でも HTTPS にしたい場合は、リバースプロキシ（nginx / Caddy / Traefik など）で
TLS を終端し、`http://localhost:8080`（app）へプロキシしてください。

アプリ側の変更は `.env` を編集して **`NEXTAUTH_URL` を https の公開 URL に合わせるだけ**です。
compose の `NEXTAUTH_URL` は `http://${SERVER_HOST}:8080` 固定になっているため、
HTTPS 化する場合は `docker-compose.yml` の該当行を直接
`NEXTAUTH_URL: https://setsubi.example.co.jp` のように書き換えて `docker compose up -d` してください。

例（Caddy なら 2 行で自己署名 or 社内 CA 証明書に対応できます）:

```
setsubi.example.co.jp {
    reverse_proxy localhost:8080
}
```

## トラブルシュート

| 症状 | 確認・対処 |
|---|---|
| ページが開かない | `docker compose ps` で app が Up か確認。`docker compose logs -f app` でエラーを確認。 |
| app が起動しない / 再起動を繰り返す | db のヘルスチェック待ちの可能性。`docker compose logs db` と `docker compose exec db pg_isready -U setsubi -d setsubi` を確認。 |
| 「required variable ... is missing」で起動失敗 | `.env` の `POSTGRES_PASSWORD` / `NEXTAUTH_SECRET` / `CRON_SECRET` / `SERVER_HOST` が未設定です。 |
| ポート 8080 が使用中 | `docker-compose.yml` の `ports: "8080:3000"` を `"18080:3000"` 等に変更し、`.env` はそのまま、`NEXTAUTH_URL` のポートも合わせて変更。 |
| ログインが変にリダイレクトされる | ブラウザで開いている URL と `NEXTAUTH_URL`（`http://SERVER_HOST:8080`）が一致しているか確認。 |
| アラートメールが届かない | ①手動実行（上記）で JSON 応答を確認 ②`SMTP_*` 設定を確認 ③`docker compose logs cron` と `docker compose logs app` を確認。 |
| 添付ファイルが表示されない | `docker compose exec app ls /data/uploads` で保存されているか確認（volume `uploads` のマウント）。 |
| ディスク使用量の確認 | `docker system df -v` で volume サイズを確認。 |

## クラウド版との違い

| 項目 | クラウド版（Vercel） | オンプレ版（本構成） |
|---|---|---|
| 課金 | Stripe サブスクリプション | **なし**（`ON_PREMISE=1` で全機能が利用可能。料金画面・決済は表示されません） |
| 写真・PDF の保存 | Vercel Blob（推測不能 URL・無認証の公開配信） | **サーバー内の volume に保存**し、ログイン必須の `/api/files/` 経由で配信（社外へ出ません） |
| アラートメール | Resend | 社内 SMTP（nodemailer） |
| 定期実行 | Vercel Cron | cron サイドカーコンテナ |
| デモ体験 | デモボタンあり | **デモボタンあり**（同様に使えます。デモ会社のデータは毎日のアラート実行時に自動清掃されます） |
| データの所在 | クラウド | すべて社内サーバー内（db-data / uploads volume） |

---

運営: スマコウバ運営事務局
