#!/bin/sh
# =============================================================================
# 点検期限アラート用 cron サイドカーのエントリポイント。
# alpine(busybox) の crontab 配置 /etc/crontabs/root に書き込み、
# crond をフォアグラウンドで実行する（コンテナの PID 1 として動かすため）。
#
# 実行時刻を変えたい場合は下の「0 9 * * *」（毎日 9:00、TZ=Asia/Tokyo）を
# 編集して `docker compose restart cron` してください。
#   分 時 日 月 曜日  → 例: 「30 7 * * *」= 毎日 7:30
# =============================================================================
set -eu

# ヒアドキュメントは 'EOF' でクォートしているため $CRON_SECRET はここでは展開されず、
# cron 実行時にコンテナの環境変数から展開される。
cat > /etc/crontabs/root <<'EOF'
# スマコウバ設備: 点検期限アラート（毎日 9:00 JST）
0 9 * * * wget -qO- --header="Authorization: Bearer $CRON_SECRET" http://app:3000/api/cron/inspection-alert
EOF

echo "[cron] crontab installed:"
cat /etc/crontabs/root

# -f: フォアグラウンド / -l 8: ログレベル / -L: ログを標準出力へ（docker logs で見える）
exec crond -f -l 8 -L /dev/stdout
