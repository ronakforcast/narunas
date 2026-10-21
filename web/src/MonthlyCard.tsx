import type { MonthlyData, MonthlyPoint } from "./types";
import { fmtEUR } from "./format";

const COLOR_A = "#ff8c00"; // amber — country A
const COLOR_B = "#00e5ff"; // ice cyan — country B

/** "2026 so far" total for a monthly series. */
function ytd(points: MonthlyPoint[]): { total: number; year: number } {
  const year = new Date().getFullYear();
  const total = points
    .filter((p) => p.period.startsWith(String(year)))
    .reduce((s, p) => s + p.value_meur, 0);
  return { total, year };
}

function lastMonth(points: MonthlyPoint[]): string {
  return points.length ? points[points.length - 1].period : "";
}

function MonthlyBars({
  points,
  color,
}: {
  points: MonthlyPoint[];
  color: string;
}) {
  if (points.length === 0) return null;
  const W = 420;
  const H = 64;
  const max = Math.max(...points.map((p) => p.value_meur), 0.001);
  const bw = W / points.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="monthly-bars">
      {points.map((p, i) => (
        <rect
          key={p.period}
          x={i * bw + 0.5}
          y={H - (p.value_meur / max) * H}
          width={Math.max(bw - 1, 0.8)}
          height={Math.max((p.value_meur / max) * H, 0.6)}
          fill={color}
          opacity={0.85}
        >
          <title>{`${p.period}: ${fmtEUR(p.value_meur)}`}</title>
        </rect>
      ))}
      {[0, Math.floor(points.length / 2), points.length - 1].map((i) => (
        <text
          key={i}
          x={i * bw + bw / 2}
          y={H + 11}
          textAnchor="middle"
          className="tick"
        >
          {points[i]?.period.slice(2)}
        </text>
      ))}
    </svg>
  );
}

export default function MonthlyCard({
  data,
  nameA,
  nameB,
}: {
  data: MonthlyData;
  nameA: string;
  nameB: string;
}) {
  if (!data.available) return null;
  const ab = data.from_to ?? [];
  const ba = data.to_from ?? [];
  const ytdA = ytd(ab);
  const ytdB = ytd(ba);
  const last = lastMonth(ab.length ? ab : ba);

  return (
    <section className="card monthly">
      <h3>
        Recent months{" "}
        <span className="year">
          through {last} · EUR · {data.source}
        </span>
      </h3>
      <p className="hint">
        Monthly figures as each side reports them, so they can still change.
        The annual numbers above are the settled ones.
      </p>
      <div className="monthly-grid">
        <div className="monthly-col">
          <div className="monthly-head">
            <span style={{ color: COLOR_A }}>
              {nameA} → {nameB}
            </span>
            <span className="monthly-ytd">
              {ytdA.total > 0 ? `${ytdA.year} so far: ${fmtEUR(ytdA.total)}` : "no data"}
            </span>
          </div>
          <MonthlyBars points={ab} color={COLOR_A} />
        </div>
        <div className="monthly-col">
          <div className="monthly-head">
            <span style={{ color: COLOR_B }}>
              {nameB} → {nameA}
            </span>
            <span className="monthly-ytd">
              {ytdB.total > 0 ? `${ytdB.year} so far: ${fmtEUR(ytdB.total)}` : "no data"}
            </span>
          </div>
          <MonthlyBars points={ba} color={COLOR_B} />
        </div>
      </div>
    </section>
  );
}
