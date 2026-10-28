import { useMemo, useState, type ReactNode } from "react";
import type { MonthlyData, PairData, ProductRef } from "./types";
import { fmtUSD } from "./format";
import { IconDownload, IconClose } from "./icons";
import {
  byHeading,
  byChapter,
  growthPct,
  unitPricePerKg,
  sortProducts,
  type ProductSort,
  type HierarchyNode,
} from "./products";
import type { SearchHit } from "./productSearch";
import ProductSearchInput from "./ProductSearchInput";
import { hs4Name, chapterTitle } from "./hs";

const PREVIEW_ROWS = 10;

function fmtGrowth(p: number): string {
  const arrow = p >= 0 ? "▲" : "▼";
  const a = Math.abs(p);
  return `${arrow}${a >= 10 ? Math.round(a) : a.toFixed(1)}%`;
}

function fmtPrice(p: number): string {
  const digits = p >= 1000 ? 0 : p >= 100 ? 1 : p >= 1 ? 2 : 3;
  return `$${p.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}/kg`;
}

function fmtQty(t: number): string {
  return t >= 1000
    ? `${(t / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k t`
    : `${t.toLocaleString("en-US", { maximumFractionDigits: 1 })} t`;
}

/** One product row: rank, name, value, growth, unit price. */
function ProductRow({
  rank,
  p,
  total,
  onPick,
  focused,
}: {
  rank: number;
  p: ProductRef;
  total: number;
  onPick: (p: ProductRef) => void;
  focused: boolean;
}) {
  const g = growthPct(p);
  const price = unitPricePerKg(p);
  return (
    <li
      className={`pr-tr${focused ? " focus" : ""}`}
      onClick={() => onPick(p)}
      title={p.description ?? `HS ${p.hs6}`}
    >
      <span className="pr-rank">{rank}</span>
      <span className="pr-desc">{p.description ?? `HS ${p.hs6}`}</span>
      <span className="pr-share">
        {total > 0 ? `${Math.max(1, Math.round((p.value_musd / total) * 100))}%` : ""}
      </span>
      <span className="pr-val">{fmtUSD(p.value_musd)}</span>
      <span
        className={`pr-grow ${g == null ? "new" : g >= 0 ? "up" : "down"}`}
        title={g == null ? "new to this lane in 2024" : "change vs 2023"}
      >
        {g == null ? "new" : fmtGrowth(g)}
      </span>
      <span className="pr-price" title="average unit value: value / weight">
        {price != null ? fmtPrice(price) : "—"}
      </span>
    </li>
  );
}

/** What we know about one product (or heading/chapter) in this lane. */
function DrillPanel({
  hit,
  pairData,
  onClose,
}: {
  hit: SearchHit;
  pairData: PairData;
  onClose: () => void;
}) {
  const A = pairData.from;
  const B = pairData.to;

  const find = (code: string) => ({
    ab: pairData.goods.from_to_products.find((p) => p.hs6 === code),
    ba: pairData.goods.to_from_products.find((p) => p.hs6 === code),
  });

  const node = (list: ProductRef[], prefix: string): HierarchyNode | null => {
    const agg =
      prefix.length === 2 ? byChapter(list) : byHeading(list);
    return agg.find((n) => n.code === prefix) ?? null;
  };

  const crumb =
    hit.kind === "chapter"
      ? `Chapter ${hit.code} · ${hit.name}`
      : hit.kind === "heading"
        ? `HS ${hit.code} · ${hit.name}`
        : `HS ${hit.code} · ${hit.name}`;

  const ch = hit.code.slice(0, 2);
  const h4 = hit.code.slice(0, 4);

  const stat = (
    label: string,
    value: string,
    sub?: string,
  ) => (
    <div className="dr-stat">
      <span className="dr-label">{label}</span>
      <span className="dr-value">{value}</span>
      {sub ? <span className="dr-sub">{sub}</span> : null}
    </div>
  );

  let body: ReactNode = null;

  if (hit.kind === "hs6") {
    const { ab, ba } = find(hit.code);
    const laneN = pairData.goods.from_to_n;
    body = (
      <div className="dr-grid">
        {ab ? (
          stat(
            `${A} → ${B}`,
            fmtUSD(ab.value_musd),
            `${growthPct(ab) == null ? "new" : fmtGrowth(growthPct(ab)!)}` +
              (unitPricePerKg(ab) != null
                ? ` · ${fmtPrice(unitPricePerKg(ab)!)}`
                : "") +
              (ab.qty_t ? ` · ${fmtQty(ab.qty_t)}` : ""),
          )
        ) : (
          stat(`${A} → ${B}`, "—", `not in the top ${laneN ? Math.min(100, laneN) : 100} of this lane`)
        )}
        {ba ? (
          stat(
            `${B} → ${A}`,
            fmtUSD(ba.value_musd),
            `${growthPct(ba) == null ? "new" : fmtGrowth(growthPct(ba)!)}` +
              (unitPricePerKg(ba) != null
                ? ` · ${fmtPrice(unitPricePerKg(ba)!)}`
                : "") +
              (ba.qty_t ? ` · ${fmtQty(ba.qty_t)}` : ""),
          )
        ) : (
          stat(`${B} → ${A}`, "—", `not in the top ${pairData.goods.to_from_n ? Math.min(100, pairData.goods.to_from_n) : 100} of this lane`)
        )}
      </div>
    );
  } else {
    // heading or chapter: aggregate both directions' product lists
    const scope = hit.kind === "chapter" ? ch : h4;
    const nab = node(pairData.goods.from_to_products, scope);
    const nba = node(pairData.goods.to_from_products, scope);
    body = (
      <div className="dr-grid">
        {stat(
          `${A} → ${B}`,
          nab ? fmtUSD(nab.value_musd) : "—",
          nab ? `${nab.count} products in the top 100` : "none in the top 100",
        )}
        {stat(
          `${B} → ${A}`,
          nba ? fmtUSD(nba.value_musd) : "—",
          nba ? `${nba.count} products in the top 100` : "none in the top 100",
        )}
      </div>
    );
  }

  return (
    <div className="pr-drill">
      <button className="dr-close" onClick={onClose} aria-label="close product detail">
        <IconClose width={12} height={12} />
      </button>
      <div className="dr-crumb">
        {chapterTitle(ch) ? (
          <span className="dr-step">Ch {ch} · {chapterTitle(ch)}</span>
        ) : null}
        {hit.kind !== "chapter" ? (
          <>
            <span className="dr-sep">›</span>
            <span className="dr-step">HS {h4} · {hs4Name(h4) ?? ""}</span>
          </>
        ) : null}
        {hit.kind === "hs6" ? (
          <>
            <span className="dr-sep">›</span>
            <span className="dr-step dr-now">{crumb}</span>
          </>
        ) : null}
      </div>
      {body}
      <p className="dr-note">
        {hit.kind === "hs6"
          ? "average unit value = trade value ÷ weight (BACI, 2024); growth = 2024 vs 2023"
          : "aggregated over this lane's top-100 products per direction"}
      </p>
    </div>
  );
}

/** The whole dataset we hold for the pair, as a multi-section CSV. */
function buildCsv(
  pairData: PairData,
  monthly: MonthlyData | null,
  nameOf: (iso: string) => string,
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

  L.push(`direct top products ${pairData.indirect.year} (USD millions, tons, USD/kg)`);
  L.push(
    "direction,rank,hs6,description,value_2024,value_2023,growth_pct,qty_tons,usd_per_kg",
  );
  const row = (p: ProductRef, i: number, dir: string) => {
    const g = growthPct(p);
    const price = unitPricePerKg(p);
    L.push(
      `${dir},${i + 1},${p.hs6 ?? ""},${esc(p.description ?? "")},${p.value_musd},` +
        `${p.prev_musd ?? ""},${g == null ? "" : g.toFixed(1)},` +
        `${p.qty_t ?? ""},${price == null ? "" : price.toFixed(2)}`,
    );
  };
  pairData.goods.from_to_products.forEach((p, i) => row(p, i, `${A}->${B}`));
  pairData.goods.to_from_products.forEach((p, i) => row(p, i, `${B}->${A}`));
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
  const aggIndirect = (
    list: PairData["indirect"]["from_to"],
  ): { hs4: string; value_musd: number }[] => {
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
  };
  aggIndirect(pairData.indirect.from_to).forEach((p, i) =>
    L.push(
      `${A}->...->${B},${i + 1},${p.hs4},${esc(hs4Name(p.hs4) ?? "")},${p.value_musd}`,
    ),
  );
  aggIndirect(pairData.indirect.to_from).forEach((p, i) =>
    L.push(
      `${B}->...->${A},${i + 1},${p.hs4},${esc(hs4Name(p.hs4) ?? "")},${p.value_musd}`,
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
  const [tab, setTab] = useState<"ab" | "ba">("ab");
  const [sort, setSort] = useState<ProductSort>("value");
  const [showAll, setShowAll] = useState(false);
  const [focus, setFocus] = useState<SearchHit | null>(null);

  const latest = pairData.goods.years.length - 1;
  const totalAB = pairData.goods.from_to[latest] ?? 0; // A -> B
  const totalBA = pairData.goods.to_from[latest] ?? 0; // B -> A

  const products = tab === "ab"
    ? pairData.goods.from_to_products
    : pairData.goods.to_from_products;
  const laneTotal = tab === "ab" ? totalAB : totalBA;
  const laneN = (tab === "ab"
    ? pairData.goods.from_to_n
    : pairData.goods.to_from_n) ?? products.length;

  const sorted = useMemo(() => sortProducts(products, sort), [products, sort]);
  const visible = showAll ? sorted : sorted.slice(0, PREVIEW_ROWS);

  const coveredPct = laneTotal > 0
    ? Math.round((products.reduce((s, p) => s + p.value_musd, 0) / laneTotal) * 100)
    : null;

  const nameOf = (iso: string) => (iso === pairData.from ? nameA : nameB);

  function downloadCsv() {
    try {
      const csv = buildCsv(pairData, monthly, nameOf);
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

  const from = tab === "ab" ? { flag: flagA, name: nameA } : { flag: flagB, name: nameB };
  const to = tab === "ab" ? { flag: flagB, name: nameB } : { flag: flagA, name: nameA };

  return (
    <section className="card pr-card">
      <h3>
        Product intelligence{" "}
        <span className="year">
          what {nameA} and {nameB} actually buy and sell each other
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

      {/* ---- search: find any product, heading or chapter ---- */}
      <ProductSearchInput
        placeholder="find a product in this lane — name or HS code (try “medicine” or “8542”)…"
        onPick={setFocus}
      />

      {focus && (
        <DrillPanel hit={focus} pairData={pairData} onClose={() => setFocus(null)} />
      )}

      {/* ---- direction tabs + sort ---- */}
      <div className="pr-toolbar">
        <div className="pr-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "ab"}
            className={tab === "ab" ? "active a" : ""}
            onClick={() => {
              setTab("ab");
              setShowAll(false);
            }}
          >
            {from.flag} {from.name} → {to.flag} {to.name}
          </button>
          <button
            role="tab"
            aria-selected={tab === "ba"}
            className={tab === "ba" ? "active b" : ""}
            onClick={() => {
              setTab("ba");
              setShowAll(false);
            }}
          >
            {to.flag} {to.name} → {from.flag} {from.name}
          </button>
        </div>
        <div className="pr-sorts">
          {(["value", "growth", "price"] as ProductSort[]).map((s) => (
            <button
              key={s}
              className={sort === s ? "active" : ""}
              aria-pressed={sort === s}
              onClick={() => setSort(s)}
              title={
                s === "value"
                  ? "rank by 2024 trade value"
                  : s === "growth"
                    ? "rank by 2024 vs 2023 change (lanes ≥ $0.5M)"
                    : "rank by average unit value ($/kg)"
              }
            >
              {s === "value" ? "value" : s === "growth" ? "growth" : "$/kg"}
            </button>
          ))}
        </div>
      </div>

      {products.length === 0 ? (
        <p className="pr-note">no product detail available</p>
      ) : (
        <>
          <ol className="pr-list">
            {visible.map((p, i) => (
              <ProductRow
                key={p.hs6 ?? i}
                rank={i + 1}
                p={p}
                total={laneTotal}
                focused={!!focus && focus.code === p.hs6}
                onPick={(pp) =>
                  setFocus(
                    pp.hs6
                      ? { code: pp.hs6, name: pp.description ?? pp.hs6, kind: "hs6" }
                      : null,
                  )
                }
              />
            ))}
          </ol>
          <div className="pr-foot">
            <span className="pr-coverage">
              top {products.length} of {laneN} products
              {coveredPct != null ? ` · ${coveredPct}% of lane value` : ""}
              {sort === "growth" ? " · growth shown for lanes ≥ $0.5M" : ""}
            </span>
            {sorted.length > PREVIEW_ROWS && (
              <button className="show-all" onClick={() => setShowAll(!showAll)}>
                {showAll ? "show top 10" : `show all ${sorted.length}`}
              </button>
            )}
          </div>
        </>
      )}

      <div className="pr-sub">indirect · via intermediaries (est.)</div>
      <div className="pr-grid">
        <IndirectBlock
          flagFrom={flagA}
          nameFrom={nameA}
          flagTo={flagB}
          nameTo={nameB}
          products={aggIndirectList(pairData.indirect.from_to)}
          accent="a"
        />
        <IndirectBlock
          flagFrom={flagB}
          nameFrom={nameB}
          flagTo={flagA}
          nameTo={nameA}
          products={aggIndirectList(pairData.indirect.to_from)}
          accent="b"
        />
      </div>
    </section>
  );
}

/** Aggregate the intermediaries' top products per HS4 heading. */
function aggIndirectList(
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
  accent,
}: {
  flagFrom: string;
  nameFrom: string;
  flagTo: string;
  nameTo: string;
  products: { hs4: string; value_musd: number }[];
  accent: "a" | "b";
}) {
  return (
    <div className={`pr-col ${accent}`}>
      <h4>
        {flagFrom} {nameFrom} <span className="arrow">→ … →</span> {flagTo} {nameTo}
      </h4>
      <p className="pr-framing">via intermediaries · estimated</p>
      {products.length === 0 ? (
        <p className="pr-note">no indirect routes found</p>
      ) : (
        <ol className="pr-list">
          {products.map((p, i) => (
            <li key={p.hs4} title={`${hs4Name(p.hs4) ?? ""} (HS ${p.hs4})`}>
              <span className="pr-rank">{i + 1}</span>
              <span className="pr-desc">{hs4Name(p.hs4) ?? `HS ${p.hs4}`}</span>
              <span className="pr-val">{fmtUSD(p.value_musd)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
