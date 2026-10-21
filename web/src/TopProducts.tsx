import type { MonthlyData, PairData, ProductRef } from "./types";
import { fmtUSD } from "./format";
import { IconDownload } from "./icons";
import hs4NamesJson from "./assets/hs4-names.json";

const HS4_NAMES = hs4NamesJson as unknown as Record<string, string>;

function DirectionBlock({
  flagFrom,
  nameFrom,
  flagTo,
  nameTo,
  products,
  total,
  accent,
}: {
  flagFrom: string;
  nameFrom: string;
  flagTo: string;
  nameTo: string;
  products: ProductRef[];
  total: number;
  accent: "a" | "b";
}) {
  return (
    <div className={`pr-col ${accent}`}>
      <h4>
        {flagFrom} {nameFrom} <span className="arrow">→</span> {flagTo} {nameTo}
      </h4>
      <p className="pr-framing">
        {nameFrom}&apos;s exports · {nameTo}&apos;s imports
      </p>
      {products.length === 0 ? (
        <p className="pr-note">no product detail available</p>
      ) : (
        <ol className="pr-list">
          {products.map((p, i) => (
            <li key={p.hs6 ?? i} title={p.description ?? `HS ${p.hs6}`}>
              <span className="pr-rank">{i + 1}</span>
              <span className="pr-desc">{p.description ?? `HS ${p.hs6}`}</span>
              <span className="pr-share">
                {total > 0
                  ? `${Math.max(1, Math.round((p.value_musd / total) * 100))}%`
                  : ""}
              </span>
              <span className="pr-val">{fmtUSD(p.value_musd)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Aggregate the intermediaries' top products per HS4 heading. */
function aggIndirect(
  list: PairData["indirect"]["from_to"],
): { hs4: string; value_musd: number }[] {
  const m = new Map<string, number>();
  for (const im of list) {
    for (const p of im.top_products) {
      m.set(p.hs4, (m.get(p.hs4) ?? 0) + p.value_musd);
    }
  }
  return [...m.entries()]
    .map(([hs4, value_musd]) => ({ hs4, value_musd }))
    .sort((a, b) => b.value_musd - a.value_musd)
    .slice(0, 10);
}

function IndirectBlock({
  flagFrom,
  nameFrom,
  flagTo,
  nameTo,
  products,
  hs4Name,
  accent,
}: {
  flagFrom: string;
  nameFrom: string;
  flagTo: string;
  nameTo: string;
  products: { hs4: string; value_musd: number }[];
  hs4Name: Map<string, string>;
  accent: "a" | "b";
}) {
  return (
    <div className={`pr-col ${accent}`}>
      <h4>
        {flagFrom} {nameFrom} <span className="arrow">→ … →</span> {flagTo}{" "}
        {nameTo}
      </h4>
      <p className="pr-framing">via intermediaries · estimated</p>
      {products.length === 0 ? (
        <p className="pr-note">no indirect routes found</p>
      ) : (
        <ol className="pr-list">
          {products.map((p, i) => (
            <li key={p.hs4} title={`${hs4Name.get(p.hs4) ?? HS4_NAMES[p.hs4] ?? ""} (HS ${p.hs4})`}>
              <span className="pr-rank">{i + 1}</span>
              <span className="pr-desc">
                {hs4Name.get(p.hs4) ??
                  HS4_NAMES[p.hs4] ??
                  `HS ${p.hs4}`}
              </span>
              <span className="pr-val">{fmtUSD(p.value_musd)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** The whole dataset we hold for the pair, as a multi-section CSV. */
function buildCsv(
  pairData: PairData,
  monthly: MonthlyData | null,
  nameOf: (iso: string) => string,
  hs4Name: Map<string, string>,
): string {
  const A = pairData.from;
  const B = pairData.to;
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const L: string[] = [];
  L.push("# Trade Flow Explorer export");
  L.push(`# pair,${esc(nameOf(A))} (${A}),${esc(nameOf(B))} (${B})`);
  L.push(`# generated,${new Date().toISOString()}`);
  L.push("");

  L.push("direct goods by year (USD millions)");
  L.push(`year,${A}->${B},${B}->${A}`);
  pairData.goods.years.forEach((y, i) => {
    L.push(
      `${y},${pairData.goods.from_to[i] ?? ""},${pairData.goods.to_from[i] ?? ""}`,
    );
  });
  L.push("");

  L.push(`direct top products ${pairData.indirect.year} (USD millions)`);
  L.push("direction,rank,hs6,description,value_musd");
  pairData.goods.from_to_products.forEach((p, i) =>
    L.push(
      `${A}->${B},${i + 1},${p.hs6 ?? ""},${esc(p.description ?? "")},${p.value_musd}`,
    ),
  );
  pairData.goods.to_from_products.forEach((p, i) =>
    L.push(
      `${B}->${A},${i + 1},${p.hs6 ?? ""},${esc(p.description ?? "")},${p.value_musd}`,
    ),
  );
  L.push("");

  L.push(`indirect via intermediaries ${pairData.indirect.year} (estimates, USD millions)`);
  L.push("direction,intermediary,estimate_musd");
  pairData.indirect.from_to.forEach((im) =>
    L.push(`${A}->...->${B},${im.intermediary},${im.estimate_musd}`),
  );
  pairData.indirect.to_from.forEach((im) =>
    L.push(`${B}->...->${A},${im.intermediary},${im.estimate_musd}`),
  );
  L.push("");

  L.push("indirect top products aggregated across intermediaries (estimates, USD millions)");
  L.push("direction,rank,hs4,name,value_musd");
  aggIndirect(pairData.indirect.from_to).forEach((p, i) =>
    L.push(
      `${A}->...->${B},${i + 1},${p.hs4},${esc(HS4_NAMES[p.hs4] ?? hs4Name.get(p.hs4) ?? "")},${p.value_musd}`,
    ),
  );
  aggIndirect(pairData.indirect.to_from).forEach((p, i) =>
    L.push(
      `${B}->...->${A},${i + 1},${p.hs4},${esc(HS4_NAMES[p.hs4] ?? hs4Name.get(p.hs4) ?? "")},${p.value_musd}`,
    ),
  );
  L.push("");

  if (pairData.services.from_to) {
    L.push("direct services by year (USD millions)");
    L.push(`year,${A}->${B},${B}->${A}`);
    pairData.services.years.forEach((y, i) => {
      L.push(
        `${y},${pairData.services.from_to?.[i] ?? ""},${pairData.services.to_from?.[i] ?? ""}`,
      );
    });
    L.push("");
  }

  L.push("value added OECD TiVA (USD millions)");
  L.push(`measure,${pairData.tiva.years.join(",")}`);
  Object.entries(pairData.tiva.measures).forEach(([m, vals]) =>
    L.push(`${m},${vals.join(",")}`),
  );
  L.push("");

  if (monthly?.available && monthly.from_to && monthly.to_from) {
    L.push("monthly reported (EUR millions)");
    L.push(`period,${A}->${B},${B}->${A}`);
    const ab = new Map(monthly.from_to.map((p) => [p.period, p.value_meur]));
    const ba = new Map(monthly.to_from.map((p) => [p.period, p.value_meur]));
    const periods = [...new Set([...ab.keys(), ...ba.keys()])].sort();
    periods.forEach((p) => L.push(`${p},${ab.get(p) ?? ""},${ba.get(p) ?? ""}`));
    L.push("");
  }

  return L.join("\n");
}

export default function TopProducts({
  pairData,
  nameA,
  nameB,
  flagA,
  flagB,
  monthly,
}: {
  pairData: PairData;
  nameA: string;
  nameB: string;
  flagA: string;
  flagB: string;
  monthly: MonthlyData | null;
}) {
  const latest = pairData.goods.years.length - 1;
  const totalAB = pairData.goods.from_to[latest] ?? 0; // A -> B
  const totalBA = pairData.goods.to_from[latest] ?? 0; // B -> A

  // HS4 descriptions borrowed from the direct HS6 detail where possible
  const hs4Name = new Map<string, string>();
  for (const p of [
    ...pairData.goods.from_to_products,
    ...pairData.goods.to_from_products,
  ]) {
    if (p.hs6 && p.description) {
      const h4 = p.hs6.slice(0, 4);
      if (!hs4Name.has(h4)) hs4Name.set(h4, p.description);
    }
  }

  const nameOf = (iso: string) => (iso === pairData.from ? nameA : nameB);

  function downloadCsv() {
    try {
      const csv = buildCsv(pairData, monthly, nameOf, hs4Name);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trade-${pairData.from}-${pairData.to}-${pairData.indirect.year}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* download unavailable in this environment */
    }
  }

  return (
    <section className="card pr-card">
      <h3>
        Top imports &amp; exports{" "}
        <span className="year">
          goods · {pairData.indirect.year} · what they buy and sell each other
        </span>
        <button
          className="csv-btn"
          onClick={downloadCsv}
          title="download the full data for this pair as CSV"
          aria-label="download CSV"
        >
          <IconDownload width={13} height={13} />
        </button>
      </h3>

      <div className="pr-sub">direct</div>
      <div className="pr-grid">
        <DirectionBlock
          flagFrom={flagA}
          nameFrom={nameA}
          flagTo={flagB}
          nameTo={nameB}
          products={pairData.goods.from_to_products}
          total={totalAB}
          accent="a"
        />
        <DirectionBlock
          flagFrom={flagB}
          nameFrom={nameB}
          flagTo={flagA}
          nameTo={nameA}
          products={pairData.goods.to_from_products}
          total={totalBA}
          accent="b"
        />
      </div>

      <div className="pr-sub">indirect · via intermediaries (est.)</div>
      <div className="pr-grid">
        <IndirectBlock
          flagFrom={flagA}
          nameFrom={nameA}
          flagTo={flagB}
          nameTo={nameB}
          products={aggIndirect(pairData.indirect.from_to)}
          hs4Name={hs4Name}
          accent="a"
        />
        <IndirectBlock
          flagFrom={flagB}
          nameFrom={nameB}
          flagTo={flagA}
          nameTo={nameA}
          products={aggIndirect(pairData.indirect.to_from)}
          hs4Name={hs4Name}
          accent="b"
        />
      </div>
    </section>
  );
}
