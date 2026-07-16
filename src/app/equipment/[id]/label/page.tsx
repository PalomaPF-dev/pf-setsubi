import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { ArrowLeft } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getFactoryScope, isEquipmentSiteVisible } from "@/lib/factoryScope";
import { getEquipment, listAssignmentsForEquipment } from "@/lib/db";
import { formatDate } from "@/lib/format";
import PrintButton from "@/components/PrintButton";
import DbErrorState from "@/components/DbErrorState";

export const dynamic = "force-dynamic";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export default async function EquipmentLabelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ w?: string; h?: string }>;
}) {
  const session = await requireEntitledSession();
  const { id } = await params;
  const { w, h } = await searchParams;

  let equipment, assignments;
  try {
    equipment = await getEquipment(session.companyId, id);
    // 所属工場による表示制限（他工場の設備は notFound）
    if (equipment) {
      const scope = await getFactoryScope(session.companyId, session.userId);
      if (!isEquipmentSiteVisible(scope, equipment.siteId)) equipment = null;
    }
    assignments = equipment ? await listAssignmentsForEquipment(session.companyId, id) : [];
  } catch (e) {
    console.error("[equipment label]", e);
    return (
      <div className="p-6">
        <DbErrorState />
      </div>
    );
  }
  if (!equipment) notFound();

  // 割当中の手順書から、最短の次回点検日と最新の最終点検日を算出
  const nextDueDates = assignments
    .map((a) => a.nextDueDate)
    .filter((d): d is string => d != null)
    .sort();
  const minNextDue = nextDueDates[0] ?? null;
  const lastInspectedDates = assignments
    .map((a) => a.lastInspectedDate)
    .filter((d): d is string => d != null)
    .sort();
  const maxLastInspected = lastInspectedDates[lastInspectedDates.length - 1] ?? null;

  // テプラのテープ幅に合わせてラベル寸法（mm）を調整可能。既定は 54×24mm。
  const pw = parseInt(w ?? "", 10);
  const ph = parseInt(h ?? "", 10);
  const labelW = clamp(Number.isFinite(pw) ? pw : 54, 28, 100);
  const labelH = clamp(Number.isFinite(ph) ? ph : 24, 12, 60);
  const qrMm = Math.max(8, labelH - 3); // QR は高さいっぱい

  // QR は設備詳細を開くディープリンク（端末でアクセスしたオリジンで絶対URL化）
  const head = await headers();
  const proto = head.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${head.get("host")}`;
  const qrDataUrl = await QRCode.toDataURL(`${origin}/equipment/${id}`, { width: 240, margin: 1 });

  // このルートだけラベル実寸で印刷。ラベル本体だけを原点に出す。
  const printCss = `
    @media print {
      @page { size: ${labelW}mm ${labelH}mm; margin: 0; }
      .label-print-root { padding: 0 !important; margin: 0 !important; max-width: none !important; }
      /* プレビュー枠（余白・枠線・角丸・影）を消し、ラベル本体を原点に実寸で出す */
      .label-frame { padding: 0 !important; border: 0 !important; box-shadow: none !important; border-radius: 0 !important; background: transparent !important; }
      .eqlabel { box-shadow: none !important; }
    }
    .eqlabel {
      width: ${labelW}mm; height: ${labelH}mm; display: flex; align-items: center; gap: 1.5mm;
      padding: 1.2mm 1.6mm; box-sizing: border-box; background: #fff; color: #000; overflow: hidden;
    }
    .eqlabel .qr { width: ${qrMm}mm; height: ${qrMm}mm; flex: 0 0 auto; }
    .eqlabel .info { flex: 1 1 auto; min-width: 0; line-height: 1.25; font-family: -apple-system, 'Hiragino Sans', sans-serif; }
    .eqlabel .nm { font-size: 2.2mm; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .eqlabel .no { font-size: 3.1mm; font-weight: 800; font-family: ui-monospace, monospace; letter-spacing: -0.02em; }
    .eqlabel .rw { font-size: 2.1mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .eqlabel .rw b { font-weight: 400; color: #333; }
  `;

  return (
    <div className="label-print-root mx-auto max-w-md p-4 sm:p-6">
      <style>{printCss}</style>

      {/* 画面用ツールバー（印刷時は非表示） */}
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/equipment/${id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" />
          設備詳細に戻る
        </Link>
        <PrintButton />
      </div>

      <h1 className="no-print mb-1 text-xl font-bold text-slate-800">ラベル印刷</h1>
      <p className="no-print mb-4 text-sm text-slate-500">
        テプラ等のラベルプリンタ用。QR・管理番号・最終点検日・次回点検日を印刷します。
      </p>

      {/* ラベル本体（実寸プレビュー） */}
      <div className="label-frame inline-block rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        <div className="eqlabel">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="QRコード" className="qr" />
          <div className="info">
            <div className="nm">{equipment.name}</div>
            <div className="no">{equipment.managementNo}</div>
            <div className="rw"><b>最終点検 </b>{formatDate(maxLastInspected)}</div>
            <div className="rw"><b>次回点検日 </b>{formatDate(minNextDue)}</div>
          </div>
        </div>
      </div>

      {/* サイズ切替・案内 */}
      <div className="no-print mt-5 space-y-3 text-xs text-slate-500">
        <div>
          実寸プレビュー：<strong className="text-slate-700">{labelW} × {labelH} mm</strong>（テープ幅に合わせて選択）
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {[
              { label: "12mm幅", w: 40, h: 12 },
              { label: "18mm幅", w: 48, h: 18 },
              { label: "24mm幅", w: 54, h: 24 },
              { label: "36mm幅", w: 70, h: 36 },
            ].map((p) => {
              const active = p.w === labelW && p.h === labelH;
              return (
                <Link
                  key={p.label}
                  href={`/equipment/${id}/label?w=${p.w}&h=${p.h}`}
                  className={`rounded-md border px-2.5 py-1 ${
                    active ? "border-orange-500 bg-orange-50 text-orange-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {p.label}
                </Link>
              );
            })}
          </div>
        </div>
        <p className="rounded-lg bg-slate-50 p-3 leading-relaxed">
          ・ラベルプリンタが「プリンタ」として使える場合：印刷ダイアログでそのプリンタとテープ幅を選択。<br />
          ・テプラ専用ソフト用：印刷ダイアログで「PDFとして保存」し、ソフトの画像/PDF差し込みで配置してください。<br />
          ・QRは18mm幅以上が読み取り安定（12mm幅は近距離向け）。スキャンするとこの設備の画面が開きます。
        </p>
      </div>
    </div>
  );
}
