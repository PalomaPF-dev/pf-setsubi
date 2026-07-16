# スマコウバ設備

製造現場向け **設備管理・点検システム**。スマコウバシリーズ6つ目。

## 機能

1. **設備台帳** — 設備の型式・メーカー・設置場所などを登録。カスタム項目（テキスト/数値/日付/選択肢）をノーコードで追加でき、登録フォーム・詳細・CSV/PDF出力に反映。写真・取扱説明書・図面PDFを設備ごとに添付（Vercel Blob）。CSV一括インポート/エクスポート、QRラベル印刷。
2. **点検手順書** — 順序付きの点検項目テンプレート（OK/NG判定・数値入力〔単位・上限/下限しきい値〕・テキスト・写真必須）を作成し、複数設備に割当。周期（か月/日）から次回点検日を自動計算。
3. **点検実施** — QRスキャンや設備詳細から1項目ずつ進むウィザードで記録。しきい値外の数値は自動NG（理由コメント付きでOK上書き可）。写真は撮影直後に圧縮して逐次アップロード。入力途中は端末に下書き保存され、中断から再開可能。点検中に手順書が編集された場合は保存時に検知してやり直しを促す。
4. **履歴・数値推移** — 設備ごと/横断の点検履歴（当時の項目定義をスナップショット保存するため、手順書を後から変えても過去記録は崩れない）。数値項目はしきい値帯付きのグラフで推移を表示。点検記録のA4印刷・CSV出力。
5. **期限アラート** — 期限超過/間近をダッシュボードと点検期限画面で一覧。期限の30/7/1日前にアラートメール（Vercel Cron＋Resend）。休止中・廃止設備は対象外。

## 技術スタック

- Next.js 16（App Router／Server Components＋Server Actions）
- Neon Postgres（`@neondatabase/serverless`、companyId 単位のマルチテナント）
- next-auth v4（メール＋パスワード／JWT。クッキー名はアプリ固有 `setsubi.session-token` — localhost で他のスマコウバアプリと衝突しないため）
- Vercel Blob（写真・PDF保管） / Resend（メール） / Vercel Cron（定期実行） / Stripe（サブスク課金）
- Tailwind CSS v4 / lucide-react / qrcode / html5-qrcode
- Capacitor で iOS アプリ化（リモート読込方式。スマコウバ計測と同方式）

## セットアップ

```bash
cp .env.local.example .env.local   # 値を設定（DATABASE_URL 必須）
npm install
npm run dev                        # http://localhost:5183
```

スキーマ（companies/users/equipment/custom_field_defs/documents/inspection_procedures/
inspection_items/equipment_procedures/inspection_records/inspection_item_results）は
初回アクセス時に冪等に自動作成されます（`src/lib/schema.ts`）。

手順書・点検項目は点検記録から参照されるため、記録がある場合は物理削除せず
アーカイブ（`archived`）になります（数値推移の系列と履歴表示を守るため）。

## 環境変数

`.env.local.example` を参照。最低限 `DATABASE_URL` と `NEXTAUTH_SECRET` が必要。
写真・PDF添付には `BLOB_READ_WRITE_TOKEN`、アラートメールには `RESEND_API_KEY`、
課金には `STRIPE_*` を設定。

## 注意事項

- 添付・点検写真は Vercel Blob に `access: "public"`（推測不能URL・無認証）で保存されます。
  機密性の高い書類の添付は想定していません。
- 点検記録・設備・書類を削除すると、対応する Blob 上のファイルも削除されます。

## 運営

スマコウバ運営事務局
