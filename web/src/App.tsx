import { useEffect, useMemo, useRef, useState } from "react";
import WorldMap from "./WorldMap";
import FlowChart from "./FlowChart";
import PairPanel from "./PairPanel";
import { fetchCountries, fetchPair, fetchMonthly } from "./api";
import { fmtUSD } from "./format";
import { IconSwap, IconClose, IconArrowRight } from "./icons";
import MonthlyCard from "./MonthlyCard";
import BalanceBanner from "./BalanceBanner";
import type { Country, PairData, MonthlyData } from "./types";

export default function App() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [selA, setSelA] = useState<string | null>(null);
  const [selB, setSelB] = useState<string | null>(null);
  const [pairData, setPairData] = useState<PairData | null>(null);
  const [monthly, setMonthly] = useState<MonthlyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const [dir, setDir] = useState<"ab" | "ba">("ab");
  const searchRef = useRef<HTMLInputElement | null>(null);

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

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    return countries
      .filter((c) => c.name.toLowerCase().includes(q) || c.iso3.toLowerCase() === q)
      .slice(0, 8);
  }, [query, countries]);

  function chooseMatch(i: number) {
    const m = matches[i];
    if (!m) return;
    pick(m.iso3);
    setQuery("");
    searchRef.current?.blur();
  }

  const status = error
    ? `⚠ ${error}`
    : !selA
      ? "Click a country on the map to pick A, or search by name"
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
        <div className="search">
          <input
            ref={searchRef}
            value={query}
            placeholder="Search country by name"
            onChange={(e) => {
              setQuery(e.target.value);
              setHi(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHi((h) => Math.min(h + 1, matches.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHi((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                chooseMatch(hi);
              } else if (e.key === "Escape") {
                setQuery("");
              }
            }}
          />
          {matches.length > 0 && (
            <ul className="results">
              {matches.map((c, i) => (
                <li
                  key={c.iso3}
                  className={i === hi ? "hi" : undefined}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => chooseMatch(i)}
                >
                  <span className="c-name">{c.name}</span>
                  <span className="iso">{c.iso3}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="status">{status}</div>
      </header>

      {/* selection chips */}
      <div className="chips">
        <div
          className={`chip-slot ${selA ? "filled a" : ""}`}
          onClick={() => searchRef.current?.focus()}
        >
          <span className="slot-tag">1 · A</span>
          <span className="slot-name">{selA ? names.get(selA) : "choose…"}</span>
          {selA && (
            <button
              className="slot-x"
              aria-label="remove country A"
              onClick={(e) => {
                e.stopPropagation();
                replaceSlot("a", null);
              }}
            >
              <IconClose width={12} height={12} />
            </button>
          )}
        </div>
        <button className="swap-btn" onClick={swap} disabled={!selA || !selB} aria-label="swap countries A and B">
          <IconSwap />
        </button>
        <div
          className={`chip-slot ${selB ? "filled b" : ""}`}
          onClick={() => searchRef.current?.focus()}
        >
          <span className="slot-tag">2 · B</span>
          <span className="slot-name">{selB ? names.get(selB) : "choose…"}</span>
          {selB && (
            <button
              className="slot-x"
              aria-label="remove country B"
              onClick={(e) => {
                e.stopPropagation();
                replaceSlot("b", null);
              }}
            >
              <IconClose width={12} height={12} />
            </button>
          )}
        </div>
        {(selA || selB) && (
          <button className="reset" onClick={reset}>
            <IconClose width={12} height={12} /> clear all
          </button>
        )}
        {loading && <span className="loading">loading…</span>}
      </div>

      <main>
        {/* ---- left: map picker + detail panel ---- */}
        <aside className="side">
          <WorldMap
            known={known}
            names={names}
            selA={selA}
            selB={selB}
            pairData={pairData}
            onPick={pick}
          />
          {pairData && (
            <PairPanel
              data={pairData}
              countries={countries}
              onReset={reset}
              onSwap={swap}
            />
          )}
        </aside>

        {/* ---- right: the flow hero ---- */}
        <section className="hero">
          {pairData ? (
            <>
              <BalanceBanner
                data={pairData}
                nameA={names.get(pairData.from) ?? pairData.from}
                nameB={names.get(pairData.to) ?? pairData.to}
                flagA={flagOf(pairData.from)}
                flagB={flagOf(pairData.to)}
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
              <FlowChart
                pairData={pairData}
                direction={dir}
                names={names}
                flags={flags}
              />
              <SummaryCards pairData={pairData} names={names} />
              {monthly && (
                <MonthlyCard
                  data={monthly}
                  nameA={names.get(pairData.from) ?? pairData.from}
                  nameB={names.get(pairData.to) ?? pairData.to}
                />
              )}
            </>
          ) : (
            <div className="hero-empty">
              <div className="hero-empty-inner">
                <h2>Pick two countries</h2>
                <p>
                  See how much they trade directly, in goods and services, and
                  how much of it travels through middleman countries. Ribbons
                  are sized by money. The TiVA numbers below show where each
                  economy's value actually ends up.
                </p>
                <p className="hint">
                  <span className="step">1</span> pick country A ·{" "}
                  <span className="step">2</span> pick country B, on the map or
                  in the search box.
                </p>
              </div>
            </div>
          )}
        </section>
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
