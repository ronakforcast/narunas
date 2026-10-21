import { useEffect, useMemo, useState } from "react";
import WorldMap from "./WorldMap";
import FlowChart from "./FlowChart";
import PairPanel from "./PairPanel";
import { fetchCountries, fetchPair, fetchMonthly } from "./api";
import { fmtUSD } from "./format";
import { IconSwap, IconClose, IconArrowRight } from "./icons";
import MonthlyCard from "./MonthlyCard";
import BalanceBanner from "./BalanceBanner";
import TopPartners from "./TopPartners";
import TopProducts from "./TopProducts";
import NewsCard from "./NewsCard";
import CountrySlot from "./CountrySlot";
import type { Country, PairData, MonthlyData } from "./types";

export default function App() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [selA, setSelA] = useState<string | null>(null);
  const [selB, setSelB] = useState<string | null>(null);
  const [pairData, setPairData] = useState<PairData | null>(null);
  const [monthly, setMonthly] = useState<MonthlyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dir, setDir] = useState<"ab" | "ba">("ab");

  useEffect(() => {
    fetchCountries()
      .then(setCountries)
      .catch((e) => setError(String(e)));
  }, []);

  const known = useMemo(() => new Set(countries.map((c) => c.iso3)), [countries]);
  const names = useMemo(
    () => new Map(countries.map((c) => [c.iso3, c.name])),
    [countries],
  );
  const flags = useMemo(
    () => new Map(countries.map((c) => [c.iso3, c.iso2 ?? ""])),
    [countries],
  );

  const iso2Of = (iso: string) =>
    countries.find((c) => c.iso3 === iso)?.iso2 ?? null;

  function flagOf(iso: string): string {
    const iso2 = flags.get(iso);
    if (!iso2 || iso2.length !== 2) return "";
    return String.fromCodePoint(
      ...iso2
        .toUpperCase()
        .split("")
        .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
    );
  }

  async function loadPair(a: string, b: string) {
    setLoading(true);
    setError(null);
    setMonthly(null);
    try {
      const data = await fetchPair(a, b);
      setPairData(data);
      setDir("ab");
      // freshness layer: best-effort, never blocks the pair
      fetchMonthly(iso2Of(a), iso2Of(b)).then(setMonthly);
    } catch (e) {
      setError(String(e));
      setPairData(null);
    } finally {
      setLoading(false);
    }
  }

  function pick(iso3: string) {
    setError(null);
    if (iso3 === selA || iso3 === selB) return; // ignore re-clicking a chosen country
    if (!selA || (selA && selB)) {
      setSelA(iso3);
      setSelB(null);
      setPairData(null);
      return;
    }
    setSelB(iso3);
    loadPair(selA, iso3);
  }

  function replaceSlot(slot: "a" | "b", iso3: string | null) {
    setError(null);
    if (iso3 === null) {
      if (slot === "a") {
        setSelA(null);
        setSelB(null);
      } else {
        setSelB(null);
      }
      setPairData(null);
      return;
    }
    if (iso3 === selA || iso3 === selB) return;
    if (slot === "a") {
      setSelA(iso3);
      if (selB) loadPair(iso3, selB);
    } else {
      setSelB(iso3);
      if (selA) loadPair(selA, iso3);
    }
  }

  function swap() {
    if (!selA || !selB) return;
    setSelA(selB);
    setSelB(selA);
    setDir(dir === "ab" ? "ba" : "ab");
    if (pairData) loadPair(selB, selA);
  }

  function reset() {
    setSelA(null);
    setSelB(null);
    setPairData(null);
    setError(null);
  }

  const status = error
    ? `⚠ ${error}`
    : !selA
      ? "Pick country A on the map, or type its name in the A slot"
      : !selB
        ? `${names.get(selA)} is A. Now pick B.`
        : loading
          ? "loading…"
          : "Click any country to start a new pair";

  return (
    <div className="app">
      <header>
        <div className="brand">
          <h1>
            trade<span>flow</span> explorer
          </h1>
          <h2>what two countries really trade, and through whom</h2>
        </div>
        <div className="chips">
          <CountrySlot
            tag="1 · A"
            accent="a"
            placeholder="country A…"
            countries={countries}
            selected={
              selA ? countries.find((c) => c.iso3 === selA) ?? null : null
            }
            onPick={(iso) => replaceSlot("a", iso)}
            onClear={() => replaceSlot("a", null)}
          />
          <button className="swap-btn" onClick={swap} disabled={!selA || !selB} aria-label="swap countries A and B">
            <IconSwap />
          </button>
          <CountrySlot
            tag="2 · B"
            accent="b"
            placeholder="country B…"
            countries={countries}
            selected={
              selB ? countries.find((c) => c.iso3 === selB) ?? null : null
            }
            onPick={(iso) => replaceSlot("b", iso)}
            onClear={() => replaceSlot("b", null)}
          />
          {(selA || selB) && (
            <button className="reset" onClick={reset}>
              <IconClose width={12} height={12} /> clear all
            </button>
          )}
          {loading && <span className="loading">loading…</span>}
        </div>
        <div className="status">{status}</div>
      </header>

      <main>
        <div className="deck">
          {/* ---- left rail: verdict, numbers, rankings ---- */}
          <aside className="rail">
            {pairData ? (
              <>
                <BalanceBanner
                  data={pairData}
                  nameA={names.get(pairData.from) ?? pairData.from}
                  nameB={names.get(pairData.to) ?? pairData.to}
                  flagA={flagOf(pairData.from)}
                  flagB={flagOf(pairData.to)}
                />
                <SummaryCards pairData={pairData} names={names} />
                <TopPartners
                  isoA={pairData.from}
                  isoB={pairData.to}
                  nameA={names.get(pairData.from) ?? pairData.from}
                  nameB={names.get(pairData.to) ?? pairData.to}
                  names={names}
                  flags={flags}
                  year={pairData.indirect.year}
                />
              </>
            ) : null}
          </aside>

          {/* ---- center: the globe ---- */}
          <section className="stage">
            <WorldMap
              known={known}
              names={names}
              selA={selA}
              selB={selB}
              pairData={pairData}
              onPick={pick}
              direction={dir}
              showArcs={!!pairData}
            />
            {!pairData && (
              <div className="empty-float">
                <div className="hero-empty-inner">
                  <h2>Pick two countries</h2>
                  <p>
                    See how much they trade directly, in goods and services,
                    and how much of it travels through middleman countries.
                    The lines on the globe show the routes. The TiVA numbers
                    show where each economy's value actually ends up.
                  </p>
                  <p className="hint">
                    <span className="step">1</span> pick country A ·{" "}
                    <span className="step">2</span> pick country B, on the map
                    or by typing the name in the slots above.
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* ---- right rail: trade news on top, then the deep detail ---- */}
          {pairData && (
            <aside className="rail">
              <NewsCard
                nameA={names.get(pairData.from) ?? pairData.from}
                nameB={names.get(pairData.to) ?? pairData.to}
              />
              <PairPanel
                data={pairData}
                countries={countries}
                onReset={reset}
                onSwap={swap}
              />
            </aside>
          )}
        </div>

        {/* ---- below: top products, the flow story, the monthly layer ---- */}
        {pairData && (
          <div className="under">
            <TopProducts
              pairData={pairData}
              nameA={names.get(pairData.from) ?? pairData.from}
              nameB={names.get(pairData.to) ?? pairData.to}
              flagA={flagOf(pairData.from)}
              flagB={flagOf(pairData.to)}
              monthly={monthly}
            />
            <div className="dir-tabs" role="tablist">
              <button
                role="tab"
                aria-selected={dir === "ab"}
                className={dir === "ab" ? "active a" : ""}
                onClick={() => setDir("ab")}
              >
                {names.get(pairData.from)} <IconArrowRight width={13} height={13} /> {names.get(pairData.to)}
              </button>
              <button
                role="tab"
                aria-selected={dir === "ba"}
                className={dir === "ba" ? "active b" : ""}
                onClick={() => setDir("ba")}
              >
                {names.get(pairData.to)} <IconArrowRight width={13} height={13} /> {names.get(pairData.from)}
              </button>
            </div>
            <div className="flow-scroll">
              <FlowChart
                pairData={pairData}
                direction={dir}
                names={names}
                flags={flags}
              />
            </div>
            {monthly && (
              <MonthlyCard
                data={monthly}
                nameA={names.get(pairData.from) ?? pairData.from}
                nameB={names.get(pairData.to) ?? pairData.to}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function SummaryCards({
  pairData,
  names,
}: {
  pairData: PairData;
  names: Map<string, string>;
}) {
  const latest = pairData.goods.years.length - 1;
  const gAB = pairData.goods.from_to[latest] ?? 0;
  const gBA = pairData.goods.to_from[latest] ?? 0;
  const indAB = pairData.indirect.from_to.reduce((s, x) => s + x.estimate_musd, 0);
  const indBA = pairData.indirect.to_from.reduce((s, x) => s + x.estimate_musd, 0);
  const sAB = pairData.services.from_to?.[pairData.services.years.length - 1] ?? null;
  const sBA = pairData.services.to_from?.[pairData.services.years.length - 1] ?? null;
  const tivaLast = pairData.tiva.years.length - 1;
  const ffd = pairData.tiva.measures["FFD_DVA"]?.[tivaLast] ?? null;
  const nameA = names.get(pairData.from) ?? pairData.from;
  const nameB = names.get(pairData.to) ?? pairData.to;

  return (
    <div className="summary-cards">
      <div className="scard">
        <div className="sc-label">direct goods {pairData.indirect.year}</div>
        <div className="sc-row">
          <span>{fmtUSD(gAB)}</span>
          <span className="sc-sub">{nameA} → {nameB}</span>
        </div>
        <div className="sc-row">
          <span>{fmtUSD(gBA)}</span>
          <span className="sc-sub">{nameB} → {nameA}</span>
        </div>
      </div>
      <div className="scard">
        <div className="sc-label">indirect via intermediaries (est.)</div>
        <div className="sc-row">
          <span>{fmtUSD(indAB)}</span>
          <span className="sc-sub">{nameA} → … → {nameB}</span>
        </div>
        <div className="sc-row">
          <span>{fmtUSD(indBA)}</span>
          <span className="sc-sub">{nameB} → … → {nameA}</span>
        </div>
      </div>
      <div className="scard">
        <div className="sc-label">services</div>
        <div className="sc-row">
          <span>{sAB != null ? fmtUSD(sAB) : "—"}</span>
          <span className="sc-sub">{nameA} → {nameB}</span>
        </div>
        <div className="sc-row">
          <span>{sBA != null ? fmtUSD(sBA) : "—"}</span>
          <span className="sc-sub">{nameB} → {nameA}</span>
        </div>
      </div>
      <div className="scard">
        <div className="sc-label">value added (TiVA {pairData.tiva.years[tivaLast] ?? "—"})</div>
        <div className="sc-row">
          <span>{ffd != null ? fmtUSD(ffd) : "—"}</span>
          <span className="sc-sub">{nameA}'s value inside {nameB}'s economy</span>
        </div>
      </div>
    </div>
  );
}
