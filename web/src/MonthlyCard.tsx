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

function MonthlyLine({
  points,
  color,
  id,
}: {
  points: MonthlyPoint[];
  color: string;
  id: string;
}) {
  if (points.length === 0) return null;
  const W = 420;
  const H = 64;
  const max = Math.max(...points.map((p) => p.value_meur), 0.001);
  const step = W / points.length;
  const pts = points.map((p, i) => ({
    x: i * step + step / 2,
    y: H - (p.value_meur / max) * H,
  }));
  const line =
    "M " +
    pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ");
  const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${H} L ${pts[0].x.toFixed(1)} ${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="monthly-line">
      <defs>
        <linearGradient id={`mfill-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <line x1="0" y1={H} x2={W} y2={H} className="baseline" />
      <path d={area} fill={`url(#mfill-${id})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {pts.map((p, i) => (
        <circle
          key={points[i].period}
          cx={p.x}
          cy={p.y}
          r={2.2}
          fill={color}
        >
          <title>{`${points[i].period}: ${fmtEUR(points[i].value_meur)}`}</title>
        </circle>
      ))}
      {[
        ...new Set([0, Math.floor(points.length / 2), points.length - 1]),
      ].map((i) => (
        <text
          key={i}
          x={i * step + step / 2}
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
          <MonthlyLine points={ab} color={COLOR_A} id="a" />
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
          <MonthlyLine points={ba} color={COLOR_B} id="b" />
        </div>
      </div>
    </section>
  );
}
