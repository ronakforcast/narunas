import type { Country, PairData, ProductRef } from "./types";
import { fmtUSD } from "./format";
import Timeseries from "./Timeseries";
import { IconSwap, IconClose } from "./icons";

const COLOR_A = "#00f2ff"; // peoplemov cyan
const COLOR_B = "#ff00ff"; // peoplemov magenta
const COLOR_TIVA = "#e6ab02"; // peoplemov gold

function flag(iso2: string | null): string {
  if (!iso2 || iso2.length !== 2) return "🏳️";
  return String.fromCodePoint(
    ...iso2
      .toUpperCase()
      .split("")
      .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

const TIVA_LABELS: Record<string, string> = {
  FFD_DVA: "{A}'s value added embodied in {B}'s final demand",
  FEXGR_DVA: "{A}'s value added embodied in {B}'s exports onward",
  DFD_FVA: "{B}'s value added embodied in {A}'s final demand",
};

interface PairPanelProps {
  data: PairData;
  countries: Country[];
  onReset: () => void;
  onSwap: () => void;
}

export default function PairPanel({
  data,
  countries,
  onReset,
  onSwap,
}: PairPanelProps) {
  const byIso = new Map(countries.map((c) => [c.iso3, c]));
  const a = byIso.get(data.from);
  const b = byIso.get(data.to);
  const nameOf = (iso: string) => byIso.get(iso)?.name ?? iso;
  const latest = data.goods.years.length - 1;
  const gAB = data.goods.from_to[latest] ?? 0;
  const gBA = data.goods.to_from[latest] ?? 0;
  const year = data.goods.years[latest];
  const servAB = data.services.from_to?.[data.services.years.length - 1] ?? null;
  const servBA = data.services.to_from?.[data.services.years.length - 1] ?? null;
  const servYear = data.services.years.length
    ? data.services.years[data.services.years.length - 1]
    : null;
  const indirectTotalAB = data.indirect.from_to.reduce(
    (s, x) => s + x.estimate_musd,
    0,
  );
  const indirectTotalBA = data.indirect.to_from.reduce(
    (s, x) => s + x.estimate_musd,
    0,
  );
  const tivaLast = data.tiva.years.length - 1;
  const tivaYear = tivaLast >= 0 ? data.tiva.years[tivaLast] : null;
  const nameA = a?.name ?? data.from;
  const nameB = b?.name ?? data.to;

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>
          {flag(a?.iso2 ?? null)} {nameA}
          <span className="x">↔</span>
          {flag(b?.iso2 ?? null)} {nameB}
        </h2>
        <div className="head-btns">
          <button className="head-btn" onClick={onSwap} title="swap A and B">
            <IconSwap /> swap
          </button>
          <button className="head-btn" onClick={onReset}>
            <IconClose width={12} height={12} /> clear
          </button>
        </div>
      </div>

      {/* ---------- INDIRECT: the headline ---------- */}
      <section className="card headline">
        <h3>
          Indirect trade via third countries{" "}
          <span className="year">goods · {data.indirect.year} · estimated</span>
        </h3>
        <p className="hint">
          How much goes from A to a middleman and then on to B, counted only
          on products both legs share. The middleman may keep some of it, so
          read the figure as a ceiling. Details under methodology.
        </p>
        <IntermediaryBars
          title={`${nameA} → … → ${nameB}`}
          color={COLOR_A}
          total={indirectTotalAB}
          direct={gAB}
          list={data.indirect.from_to}
          nameOf={nameOf}
        />
        <IntermediaryBars
          title={`${nameB} → … → ${nameA}`}
          color={COLOR_B}
          total={indirectTotalBA}
          direct={gBA}
          list={data.indirect.to_from}
          nameOf={nameOf}
        />
      </section>

      {/* ---------- direct goods ---------- */}
      <section className="card">
        <h3>
          Direct goods <span className="year">{year}</span>
        </h3>
        <div className="big-nums">
          <div>
            <div className="big" style={{ color: COLOR_A }}>
              {fmtUSD(gAB)}
            </div>
            <div className="sub">
              {nameA} → {nameB}
            </div>
          </div>
          <div>
            <div className="big" style={{ color: COLOR_B }}>
              {fmtUSD(gBA)}
            </div>
            <div className="sub">
              {nameB} → {nameA}
            </div>
          </div>
        </div>
        <Timeseries
          years={data.goods.years}
          series={[
            { label: "A→B", color: COLOR_A, values: data.goods.from_to },
            { label: "B→A", color: COLOR_B, values: data.goods.to_from },
          ]}
        />
        <div className="legend">
          <span style={{ color: COLOR_A }}>
            ■ exports {nameA} → {nameB}
          </span>{" "}
          <span style={{ color: COLOR_B }}>
            ■ exports {nameB} → {nameA}
          </span>
        </div>
        <ProductList
          title={`Top ${nameA} exports to ${nameB}`}
          products={data.goods.from_to_products}
        />
        <ProductList
          title={`Top ${nameB} exports to ${nameA}`}
          products={data.goods.to_from_products}
        />
      </section>

      {/* ---------- direct services ---------- */}
      {(servAB != null || servBA != null) && (
        <section className="card">
          <h3>
            Direct services <span className="year">{servYear}</span>
          </h3>
          <div className="big-nums">
            <div>
              <div className="big" style={{ color: COLOR_A }}>
                {servAB != null ? fmtUSD(servAB) : "—"}
              </div>
              <div className="sub">
                {nameA} → {nameB}
              </div>
            </div>
            <div>
              <div className="big" style={{ color: COLOR_B }}>
                {servBA != null ? fmtUSD(servBA) : "—"}
              </div>
              <div className="sub">
                {nameB} → {nameA}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ---------- TiVA ---------- */}
      {tivaYear != null && (
        <section className="card">
          <h3>
            Value added (OECD TiVA) <span className="year">{tivaYear}</span>
          </h3>
          <p className="hint">
            Input-output analysis of how much of one economy ends up inside the
            other, whatever route the goods took.
          </p>
          <ul className="tiva-list">
            {Object.entries(data.tiva.measures)
              .filter(([m]) => TIVA_LABELS[m])
              .map(([m, values]) => (
                <li key={m}>
                  <span className="tiva-val" style={{ color: COLOR_TIVA }}>
                    {fmtUSD(values[tivaLast] ?? 0)}
                  </span>
                  <span className="tiva-label">
                    {TIVA_LABELS[m].replaceAll("{A}", nameA).replaceAll(
                      "{B}",
                      nameB,
                    )}
                  </span>
                </li>
              ))}
          </ul>
          <Timeseries
            years={data.tiva.years}
            series={Object.entries(data.tiva.measures)
              .filter(([m]) => TIVA_LABELS[m])
              .map(([m, values]) => ({ label: m, color: COLOR_TIVA, values }))}
            height={100}
          />
        </section>
      )}

      <section className="card methodology">
        <h3>Methodology & sources</h3>
        <p>
          Direct goods: <b>CEPII BACI</b> (reconciled customs data, {year}).
          Direct services: <b>WTO-OECD BaTIS</b> (balanced, {servYear}). Value
          added: <b>OECD TiVA</b> ({tivaYear}).
        </p>
        <p>
          For every product heading both legs share, the indirect figure takes
          the smaller of exports from A to C and exports from C to B, and adds
          them up. Researchers use the same method to track sanctions
          re-routing (EBRD/CEPR, "Eurasian Roundabout"). It is an upper bound:
          the intermediary may consume those goods itself.
        </p>
      </section>
    </div>
  );
}

function IntermediaryBars({
  title,
  color,
  total,
  direct,
  list,
  nameOf,
}: {
  title: string;
  color: string;
  total: number;
  direct: number;
  list: PairData["indirect"]["from_to"];
  nameOf: (iso: string) => string;
}) {
  const max = Math.max(...list.map((x) => x.estimate_musd), 1);
  return (
    <div className="im-block">
      <div className="im-title">
        <span>{title}</span>
        <span className="im-total">
          <b style={{ color }}>{fmtUSD(total)}</b>
          <span className="vs-direct">
            vs direct {fmtUSD(direct)} · {total > direct && direct > 0
              ? `${(total / direct).toFixed(1)}×`
              : "—"}
          </span>
        </span>
      </div>
      {list.length === 0 && (
        <p className="hint">no significant intermediaries found</p>
      )}
      {list.slice(0, 8).map((im, i) => (
        <div key={im.intermediary} className="im-row">
          <span className="im-rank">{i + 1}</span>
          <span className="im-name2">{nameOf(im.intermediary)}</span>
          <div className="im-bar-wrap">
            <div
              className="im-bar"
              style={{
                width: `${Math.max((im.estimate_musd / max) * 100, 1.5)}%`,
                background: color,
              }}
            />
          </div>
          <span className="im-val2">{fmtUSD(im.estimate_musd)}</span>
          <div className="im-products">
            {im.top_products.slice(0, 3).map((p) => (
              <span key={p.hs4} className="chip" title={`HS ${p.hs4}`}>
                HS {p.hs4} · {fmtUSD(p.value_musd)}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProductList({
  title,
  products,
}: {
  title: string;
  products: ProductRef[];
}) {
  if (!products || products.length === 0) return null;
  return (
    <details className="products">
      <summary>{title}</summary>
      <ul>
        {products.map((p) => (
          <li key={p.hs6}>
            <span className="desc">{p.description ?? `HS ${p.hs6}`}</span>
            <span className="val">{fmtUSD(p.value_musd)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
