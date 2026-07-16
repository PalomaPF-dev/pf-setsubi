import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getFactoryScope, scopedSiteId } from "@/lib/factoryScope";
import { listEquipment, listCustomFieldDefs } from "@/lib/db";
import { todayJST } from "@/lib/inspection";
import { formatDate } from "@/lib/format";
import { ledgerHeaders, ledgerCells } from "@/lib/ledger";
import PrintButton from "@/components/PrintButton";
import DbErrorState from "@/components/DbErrorState";

export const dynamic = "force-dynamic";

export default async function EquipmentPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; site?: string; area?: string }>;
}) {
  const session = await requireEntitledSession();
  const { q, site, area } = await searchParams;
  const today = todayJST();

  let items, defs;
  try {
    // 一覧と同じ工場/職場フィルタ＋所属工場による表示制限を適用
    const scope = await getFactoryScope(session.companyId, session.userId);
    const siteId = scopedSiteId(scope, site || undefined);
    [items, defs] = await Promise.all([
      listEquipment(session.companyId, q?.trim() || undefined, {
        siteId,
        areaId: area || undefined,
      }),
      listCustomFieldDefs(session.companyId),
    ]);
  } catch (e) {
    console.error("[equipment print]", e);
    return (
      <div className="p-6">
        <DbErrorState />
      </div>
    );
  }

  const headers = ledgerHeaders(defs);
  const rows = items.map((e) => ledgerCells(e, defs, today));

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
      {/* このルートだけ A4 横で印刷（用紙サイズはルート内で指定） */}
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } }`}</style>
      {/* 画面用ツールバー（印刷時は非表示） */}
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/equipment${q ? `?q=${encodeURIComponent(q)}` : ""}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" />
          台帳に戻る
        </Link>
        <PrintButton />
      </div>

      {/* 帳票ヘッダ */}
      <div className="mb-3 flex items-end justify-between border-b-2 border-slate-800 pb-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900">設備台帳</h1>
          <p className="text-xs text-slate-600">{session.companyName}</p>
        </div>
        <div className="text-right text-xs text-slate-600">
          <div>出力日：{formatDate(today)}</div>
          <div>件数：{items.length} 件{q ? `（検索: ${q}）` : ""}</div>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">出力対象の設備がありません。</p>
      ) : (
        <table className="print-table w-full border-collapse text-[10px] leading-tight">
          <thead>
            <tr className="bg-slate-100">
              {headers.map((h) => (
                <th key={h} className="border border-slate-400 px-1.5 py-1 text-left font-semibold text-slate-700">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((cells, i) => (
              <tr key={items[i].id} className="even:bg-slate-50">
                {cells.map((c, j) => (
                  <td key={j} className="border border-slate-300 px-1.5 py-1 align-top text-slate-800">
                    {c == null || c === "" ? "" : c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="no-print mt-4 text-center text-xs text-slate-400">
        ブラウザの印刷ダイアログで「PDFとして保存」を選ぶと PDF 化できます。
        <br />
        ※ 用紙の向きは「横」、「背景のグラフィック」を ON にすると見やすく印刷できます。
      </p>
    </div>
  );
}
