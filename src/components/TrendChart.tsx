import type { NumericSeriesPoint } from "@/lib/db";

/**
 * 数値推移の SVG 折れ線グラフ（Server Component、クライアント JS なし）。
 * しきい値帯（min〜max）を半透明の緑帯で描き、基準外の点は赤で強調する。
 */
export default function TrendChart({
  points,
  unit,
}: {
  points: NumericSeriesPoint[];
  unit: string | null;
}) {
  if (points.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">まだ数値データがありません</p>;
  }

  const W = 640;
  const H = 220;
  const PAD_L = 48;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 32;

  const values = points.map((p) => p.valueNumeric);
  const mins = points.map((p) => p.minValue).filter((v): v is number => v != null);
  const maxs = points.map((p) => p.maxValue).filter((v): v is number => v != null);
  // 直近のしきい値（帯の描画に使う。履歴中で変わっている場合は最新を採用）
  const bandMin = points[points.length - 1].minValue;
  const bandMax = points[points.length - 1].maxValue;

  let lo = Math.min(...values, ...(mins.length ? [Math.min(...mins)] : []));
  let hi = Math.max(...values, ...(maxs.length ? [Math.max(...maxs)] : []));
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const span = hi - lo;
  lo -= span * 0.1;
  hi += span * 0.1;

  const x = (i: number) =>
    points.length === 1
      ? (PAD_L + W - PAD_R) / 2
      : PAD_L + ((W - PAD_L - PAD_R) * i) / (points.length - 1);
  const y = (v: number) => PAD_T + (H - PAD_T - PAD_B) * (1 - (v - lo) / (hi - lo));

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.valueNumeric).toFixed(1)}`).join(" ");

  const fmt = (v: number) => {
    const a = Math.abs(v);
    return a >= 100 ? v.toFixed(0) : a >= 1 ? v.toFixed(2).replace(/\.?0+$/, "") : v.toPrecision(2);
  };
  const gridVals = [lo + (hi - lo) * 0.1, lo + (hi - lo) * 0.5, lo + (hi - lo) * 0.9];

  // X軸ラベルは最大5つに間引く
  const labelEvery = Math.max(1, Math.ceil(points.length / 5));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`数値推移グラフ（${points.length}件）`}
    >
      {/* しきい値帯 */}
      {bandMin != null && bandMax != null && (
        <rect
          x={PAD_L}
          y={y(bandMax)}
          width={W - PAD_L - PAD_R}
          height={Math.max(0, y(bandMin) - y(bandMax))}
          fill="#10b981"
          opacity="0.08"
        />
      )}
      {bandMin != null && (
        <line x1={PAD_L} x2={W - PAD_R} y1={y(bandMin)} y2={y(bandMin)} stroke="#10b981" strokeWidth="1" strokeDasharray="4 3" />
      )}
      {bandMax != null && (
        <line x1={PAD_L} x2={W - PAD_R} y1={y(bandMax)} y2={y(bandMax)} stroke="#10b981" strokeWidth="1" strokeDasharray="4 3" />
      )}
      {/* 目盛り */}
      {gridVals.map((v, i) => (
        <g key={i}>
          <line x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeWidth="1" />
          <text x={PAD_L - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
            {fmt(v)}
          </text>
        </g>
      ))}
      {/* 折れ線 */}
      <path d={path} fill="none" stroke="#ea580c" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {/* 点 */}
      {points.map((p, i) => {
        const out =
          (p.minValue != null && p.valueNumeric < p.minValue) ||
          (p.maxValue != null && p.valueNumeric > p.maxValue);
        return (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.valueNumeric)} r={out ? 4.5 : 3.5} fill={out ? "#dc2626" : "#ea580c"} />
            {i % labelEvery === 0 && (
              <text x={x(i)} y={H - PAD_B + 16} textAnchor="middle" fontSize="10" fill="#94a3b8">
                {p.inspectionDate.slice(5).replace("-", "/")}
              </text>
            )}
          </g>
        );
      })}
      {/* 最新値 */}
      <text
        x={x(points.length - 1)}
        y={y(points[points.length - 1].valueNumeric) - 10}
        textAnchor="middle"
        fontSize="11"
        fontWeight="bold"
        fill="#334155"
      >
        {fmt(points[points.length - 1].valueNumeric)}
        {unit ? ` ${unit}` : ""}
      </text>
    </svg>
  );
}
