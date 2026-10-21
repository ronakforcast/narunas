interface Series {
  label: string;
  color: string;
  values: number[];
}

interface TimeseriesProps {
  years: number[];
  series: Series[];
  height?: number;
}

/** Minimal multi-line SVG time chart. Values in USD millions. */
export default function Timeseries({
  years,
  series,
  height = 130,
}: TimeseriesProps) {
  const W = 360;
  const H = height;
  const padL = 44;
  const padR = 8;
  const padT = 8;
  const padB = 18;

  if (years.length === 0) return null;
  const max =
    Math.max(...series.flatMap((s) => s.values.map((v) => Math.abs(v))), 1) *
    1.1;
  const x = (i: number) =>
    padL + (i / Math.max(years.length - 1, 1)) * (W - padL - padR);
  const y = (v: number) => H - padB - (Math.max(v, 0) / max) * (H - padT - padB);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="timeseries">
      {[0, 0.5, 1].map((t) => (
        <line
          key={t}
          x1={padL}
          x2={W - padR}
          y1={padT + t * (H - padT - padB)}
          y2={padT + t * (H - padT - padB)}
          className="grid"
        />
      ))}
      {[max, max / 2, 0].map((v, i) => (
        <text
          key={i}
          x={padL - 4}
          y={y(v) + 3}
          textAnchor="end"
          className="tick"
        >
          {v >= 1000 ? `${(v / 1000).toFixed(0)}B` : `${v.toFixed(0)}M`}
        </text>
      ))}
      {years.map((yr, i) =>
        i % Math.ceil(years.length / 8) === 0 || i === years.length - 1 ? (
          <text key={yr} x={x(i)} y={H - 4} textAnchor="middle" className="tick">
            {yr}
          </text>
        ) : null,
      )}
      {series.map((s) => (
        <path
          key={s.label}
          d={s.values
            .map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`)
            .join(" ")}
          fill="none"
          stroke={s.color}
          strokeWidth={1.6}
        />
      ))}
      {series.map((s) => {
        const last = s.values.length - 1;
        return (
          <circle
            key={`${s.label}-dot`}
            cx={x(last)}
            cy={y(s.values[last])}
            r={2.4}
            fill={s.color}
          />
        );
      })}
    </svg>
  );
}
