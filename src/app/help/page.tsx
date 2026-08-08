import Link from "next/link";
import {
  Settings,
  Factory,
  QrCode,
  ClipboardList,
  ShieldCheck,
  BookOpen,
  Plus,
  CalendarPlus,
  CloudUpload,
  MapPinned,
  Printer,
  ArrowRight,
  Lightbulb,
} from "lucide-react";
import { requireSession } from "@/lib/session";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

/**
 * アプリ内「使い方」ガイド。設備登録 → 点検実施 → 承認 までの手順を
 * ステップ形式でまとめ、各画面への導線（リンク）を用意する。純粋な静的説明。
 */
export default async function HelpPage() {
  await requireSession();

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <PageHeader
        title="使い方ガイド"
        description="設備の登録から、点検の実施・承認までの手順をまとめています"
      />

      {/* 早わかり導線 */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <QuickLink href="/settings" icon={Settings} label="① 準備（設定）" tone="slate" />
        <QuickLink href="/equipment/new" icon={Factory} label="② 設備を登録" tone="orange" />
        <QuickLink href="/scan" icon={QrCode} label="③ 点検を開始" tone="orange" />
      </div>

      <div className="flex flex-col gap-6">
        {/* 0. 準備 */}
        <Section
          icon={Settings}
          num="0"
          title="はじめに：最初の準備（設定）"
          subtitle="点検を始める前に、設定ページで下記を登録しておくとスムーズです"
        >
          <Step n={1} title="工場・職場を登録">
            <Link href="/settings" className="font-medium text-orange-700 hover:underline">
              設定
            </Link>{" "}
            →「工場・職場」で、拠点（工場）とライン・エリア（職場）を登録します。設備の設置場所やマップに使います。
          </Step>
          <Step n={2} title="管理番号の採番ルール">
            「管理番号 採番ルール」でプレフィックス・桁数を設定すると、設備登録時に「自動採番」で番号を発番できます。
          </Step>
          <Step n={3} title="承認者を確認（ポータル）">
            点検完了を承認する<strong>承認者</strong>は<strong>ポータルのユーザー設定</strong>で管理します。
            職場の管理者が既定の承認者になり、アプリへ自動で連携されます。
          </Step>
          <Step n={4} title="点検手順書を作成">
            <Link href="/checklists" className="font-medium text-orange-700 hover:underline">
              点検手順書
            </Link>{" "}
            で、点検項目（OK/NG・数値・写真など）のテンプレートを作成します。設備に割り当てて点検します。
            <br />
            <span className="text-slate-500">
              ※ 各項目に「点検箇所の写真」や「点検部位マップ」を登録すると、点検時に「どこを見るか」が表示されます。
            </span>
          </Step>
        </Section>

        {/* 1. 設備登録 */}
        <Section
          icon={Factory}
          num="1"
          title="設備を登録する"
          subtitle="設備台帳に1台ずつ登録します"
          cta={{ href: "/equipment/new", label: "設備を登録する" }}
        >
          <Step n={1} title="登録フォームを開く">
            <Link href="/equipment" className="font-medium text-orange-700 hover:underline">
              設備台帳
            </Link>{" "}
            を開き、右上の「<strong>設備を登録</strong>」ボタンを押します。
          </Step>
          <Step n={2} title="基本情報を入力">
            <strong>管理番号</strong>（必須・「自動採番」ボタンで自動発番も可）と<strong>設備名</strong>
            （必須）を入力します。カテゴリ・メーカー・型式・製造番号・導入日・状態は任意です。
          </Step>
          <Step n={3} title="設置場所を選ぶ">
            工場・職場（設定で登録済みの場合に表示）と、詳細位置（例：Aライン奥）を指定します。
          </Step>
          <Step n={4} title="登録する">
            カスタム項目・備考を入力し、「<strong>登録する</strong>」ボタンを押すと保存され、設備詳細ページが開きます。
          </Step>
        </Section>

        {/* 2. 設備の初期設定 */}
        <Section
          icon={ClipboardList}
          num="2"
          title="設備に点検手順書・写真・QRを設定する"
          subtitle="登録した設備の詳細ページで、点検の準備をします"
        >
          <Step n={1} title="点検手順書を割り当てる" icon={CalendarPlus}>
            設備詳細の「<strong>手順書を割り当てる</strong>」で手順書を選び、<strong>周期</strong>（例：1か月ごと／30日ごと、空欄なら都度点検）を設定して「<strong>割り当てる</strong>」を押します。これで点検スケジュールに載ります。
          </Step>
          <Step n={2} title="写真・書類を添付" icon={CloudUpload}>
            「写真・書類」で種別（設備写真／取扱説明書／図面／その他）を選び、ファイルを「<strong>アップロード</strong>」します。
          </Step>
          <Step n={3} title="QRコード・ラベル印刷" icon={Printer}>
            設備詳細のQRコードを「<strong>ラベル印刷（テプラ）</strong>」で印刷し、現場の設備に貼ると、スマホでスキャンしてすぐ点検を始められます。
          </Step>
          <Step n={4} title="設置マップに配置（任意）" icon={MapPinned}>
            工場マップを登録している場合は「<strong>マップに配置</strong>」で、設備の位置をタップして配置できます。
          </Step>
        </Section>

        {/* 3. 点検の実施 */}
        <Section
          icon={QrCode}
          num="3"
          title="点検を実施する"
          subtitle="現場の作業者がスマホで点検します"
          cta={{ href: "/scan", label: "点検・スキャンを開く" }}
        >
          <Step n={1} title="点検を開始する">
            <Link href="/scan" className="font-medium text-orange-700 hover:underline">
              点検・スキャン
            </Link>{" "}
            から、①設備のQRコードを読み取る、②管理番号で開く、③「期限が近い点検」の「
            <strong>点検開始</strong>」のいずれかで始めます。ダッシュボードや設備詳細の「点検開始」からも可能です。
          </Step>
          <Step n={2} title="作業者を選ぶ">
            「作業者を選択」画面で、<strong>名簿から選ぶ</strong>か名前を<strong>直接入力</strong>して「
            <strong>点検を開始する</strong>」を押します。
          </Step>
          <Step n={3} title="項目ごとに点検・記録">
            各項目で「<strong>ここを点検（点検箇所）</strong>」の写真や正常見本を確認しながら、OK/NG・数値・写真などを入力します。数値は基準値から自動でOK/NG判定。必要に応じて<strong>音声を録る・動画を撮る</strong>で記録を残せます（NG時はコメントが必須）。
          </Step>
          <Step n={4} title="確認して完了">
            全項目を入力したら「<strong>確認へ</strong>」→ 内容を確認し「<strong>点検を完了する</strong>」を押します。記録は「<strong>承認待ち</strong>」で保存され、承認者へ結果メールが届きます。
          </Step>
          <Tip>
            入力の途中でアプリを閉じても<strong>下書きが自動保存</strong>されます。次に開くと「前回の続きから再開しますか？」と表示されます。
          </Tip>
        </Section>

        {/* 4. 承認 */}
        <Section
          icon={ShieldCheck}
          num="4"
          title="点検を承認する（管理者）"
          subtitle="点検結果を確認し、承認または差し戻します"
          cta={{ href: "/inspections?approval=pending", label: "承認待ちの点検を見る" }}
        >
          <Step n={1} title="承認待ちを開く">
            <Link href="/inspections?approval=pending" className="font-medium text-orange-700 hover:underline">
              点検履歴
            </Link>{" "}
            やダッシュボードの「承認待ち」から記録を開きます（承認依頼メールのリンクからも開けます）。
          </Step>
          <Step n={2} title="承認する / 差し戻す">
            内容を確認し「<strong>承認する</strong>」で点検完了として確定します。やり直しが必要なら「
            <strong>差し戻す</strong>」→ 理由を入力して「<strong>差し戻しを確定</strong>」。差し戻すと、その設備は再点検対象に戻ります。
          </Step>
          <Step n={3} title="差し戻し後の再点検・再提出">
            作業者は「<strong>設備を開いて再点検</strong>」で点検し直すか、修正後に「
            <strong>この記録を再提出（承認待ちへ）</strong>」で再度承認を依頼します。
          </Step>
        </Section>

        {/* 困ったとき */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-700">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            よくある質問
          </h2>
          <ul className="space-y-2 text-sm text-slate-600">
            <li>
              <strong>点検予定に出てこない</strong> … 設備に点検手順書を割り当て、周期を設定しているか確認してください（設備詳細 →「手順書を割り当てる」）。
            </li>
            <li>
              <strong>点検時に「どこを見るか」が出ない</strong> … 手順書の各項目に「点検箇所の写真」または「点検部位マップ」を登録すると表示されます。
            </li>
            <li>
              <strong>承認依頼メールが届かない</strong> … ポータルのユーザー設定で承認者とそのメールアドレスが登録されているかご確認ください（メール配信の有効化には別途サーバー設定が必要な場合があります）。
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ===== パーツ ===== */

function QuickLink({
  href,
  icon: Icon,
  label,
  tone,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone: "slate" | "orange";
}) {
  const cls =
    tone === "orange"
      ? "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
  return (
    <Link
      href={href}
      className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition ${cls}`}
    >
      <span className="inline-flex items-center gap-2">
        <Icon className="h-5 w-5" />
        {label}
      </span>
      <ArrowRight className="h-4 w-4 opacity-60" />
    </Link>
  );
}

function Section({
  icon: Icon,
  num,
  title,
  subtitle,
  cta,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  num: string;
  title: string;
  subtitle: string;
  cta?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-slate-800">
            <span className="mr-1.5 text-orange-500">STEP {num}</span>
            {title}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      <ol className="flex flex-col gap-3">{children}</ol>
      {cta && (
        <Link
          href={cta.href}
          className="mt-4 inline-flex h-11 items-center gap-1.5 rounded-lg bg-orange-700 px-4 text-sm font-semibold text-white hover:bg-orange-800"
        >
          {cta.label}
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </section>
  );
}

function Step({
  n,
  title,
  icon: Icon,
  children,
}: {
  n: number;
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          {Icon && <Icon className="h-4 w-4 text-orange-500" />}
          {title}
        </div>
        <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{children}</p>
      </div>
    </li>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <span>{children}</span>
    </div>
  );
}
