import { useMemo } from "react";
import type { ProductGlobalData } from "./types";
import { fmtUSD } from "./format";
import { IconClose } from "./icons";
import { chapterTitle, hs4Name, hs6Name } from "./hs";

export interface ProductGlobalProps {
  hit: { code: string; name: string; kind: "hs6" | "heading" | "chapter" };
  data: ProductGlobalData;
  nameOf: (iso: string) => string;
  flagOf: (iso: string) => string;
  onPickMarket: (iso: string) => void;
  onPickSupplier: (iso: string) => void;
  onChild: (code: string) => void;
  onClose: () => void;
}

function fmtGrowth(p: number): string {
  const arrow = p >= 0 ? "▲" : "▼";
  const a = Math.abs(p);
  return `${arrow}${a >= 10 ? Math.round(a) : a.toFixed(1)}%`;
}

export default function ProductGlobal({
  hit,
  data,
  nameOf,
  flagOf,
  onPickMarket,
  onPickSupplier,
  onChild,
  onClose,
}: ProductGlobalProps) {
  const wGrowth =
    data.world.v23 > 0
      ? ((data.world.v24 - data.world.v23) / data.world.v23) * 100
      : null;
  const worldPrice = data.importers.reduce((s, m) => s + m.v24, 0) /
    (data.importers.reduce((s, m) => s + m.qty24, 0) || 1);
  const price = worldPrice > 0 ? worldPrice * 1000 : null;

  const ch2 = data.code.slice(0, 2);
  const focusChild = hit.kind === "hs6" ? hit.code : null;

  const childLabel = (code: string): string =>
    data.kind === "chapter"
      ? hs4Name(code) ?? `HS ${code}`
      : hs6Name(code) ?? `HS ${code}`;

  const marketRows = useMemo(
    () => data.importers.slice(0, 10),
    [data.importers],
  );
  const exporterRows = useMemo(
    () => data.exporters.slice(0, 10),
    [data.exporters],
  );

  return (
    <div className="pg-card">
      <button className="pg-close" onClick={onClose} aria-label="close product view">
        <IconClose width={13} height={13} />
      </button>

      <header className="pg-head">
        <h2>{hit.kind === "hs6" ? hit.name : hit.name}</h2>
        <p className="pg-crumb">
          {data.kind === "chapter" ? (
            <span>Chapter {data.code} · {chapterTitle(data.code)}</span>
          ) : (
            <span>
              HS {data.code} · {hs4Name(data.code)}
              {chapterTitle(ch2) ? (
                <span className="pg-crumb-sub">
                  {" "}· chapter {ch2} · {chapterTitle(ch2)}
                </span>
              ) : null}
            </span>
          )}
        </p>
      </header>

      <div className="pg-world">
        <div className="pg-stat">
          <span className="pg-label">world trade {data.kind === "hs4" ? "of this product" : "of this category"} · 2024</span>
          <span className="pg-value">{fmtUSD(data.world.v24)}</span>
          {wGrowth != null && (
            <span className={`pg-growth ${wGrowth >= 0 ? "up" : "down"}`}>
              {fmtGrowth(wGrowth)} vs 2023
            </span>
          )}
        </div>
        {price != null && (
          <div className="pg-stat">
            <span className="pg-label">average unit value</span>
            <span className="pg-value">
              ${price >= 100 ? price.toFixed(0) : price >= 1 ? price.toFixed(2) : price.toFixed(3)}/kg
            </span>
            <span className="pg-crumb-sub">across reported weights</span>
          </div>
        )}
      </div>

      <div className="pg-cols">
        <div className="pg-col">
          <h3>
            top importing markets{" "}
            <span className="pg-action">click to target as country B</span>
          </h3>
          <ol className="pg-list">
            {marketRows.map((m, i) => {
              const g = m.v23 > 0 ? ((m.v24 - m.v23) / m.v23) * 100 : null;
              return (
                <li key={m.iso3} onClick={() => onPickMarket(m.iso3)}
                    title={`top direct suppliers: ${m.suppliers.map((s) => nameOf(s.iso3)).join(", ")}`}>
                  <span className="pg-rank">{i + 1}</span>
                  <span className="pg-flag">{flagOf(m.iso3)}</span>
                  <span className="pg-name">{nameOf(m.iso3)}</span>
                  {m.suppliers.length > 0 && (
                    <span className="pg-sup">
                      from {m.suppliers.slice(0, 3).map((s) => flagOf(s.iso3)).join(" ")}
                    </span>
                  )}
                  <span className="pg-share">{m.share}%</span>
                  <span className={`pg-g ${g == null ? "new" : g >= 0 ? "up" : "down"}`}>
                    {g == null ? "new" : fmtGrowth(g)}
                  </span>
                  <span className="pg-v">{fmtUSD(m.v24)}</span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="pg-col">
          <h3>
            top exporters{" "}
            <span className="pg-action">click to sell as country A</span>
          </h3>
          <ol className="pg-list">
            {exporterRows.map((e, i) => {
              const g = e.v23 > 0 ? ((e.v24 - e.v23) / e.v23) * 100 : null;
              return (
                <li key={e.iso3} className="ex" onClick={() => onPickSupplier(e.iso3)}
                    title={`click to set ${nameOf(e.iso3)} as country A`}>
                  <span className="pg-rank">{i + 1}</span>
                  <span className="pg-flag">{flagOf(e.iso3)}</span>
                  <span className="pg-name">{nameOf(e.iso3)}</span>
                  <span className={`pg-g ${g == null ? "new" : g >= 0 ? "up" : "down"}`}>
                    {g == null ? "new" : fmtGrowth(g)}
                  </span>
                  <span className="pg-v">{fmtUSD(e.v24)}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {data.children.length > 0 && (
        <div className="pg-children">
          <h3>
            {data.kind === "chapter" ? "top headings" : "top products in this heading"}
          </h3>
          <ul>
            {data.children.slice(0, 8).map((c) => (
              <li
                key={c.code}
                className={c.code === focusChild ? "focus" : ""}
              >
                <button
                  className="pg-child"
                  onClick={() => onChild(c.code)}
                  title={
                    data.kind === "chapter"
                      ? "open this heading's global view"
                      : `top importers: ${c.importers.map((m) => nameOf(m.iso3)).slice(0, 3).join(", ")}`
                  }
                >
                  <span className="pg-child-name">{childLabel(c.code)}</span>
                  <span className="pg-child-v">{fmtUSD(c.v24)}</span>
                  {c.importers.length > 0 && (
                    <span className="pg-child-im">
                      → {c.importers.slice(0, 3).map((m) => flagOf(m.iso3)).join(" ")}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="pg-hint">
        pick a market above, then pick your country on the globe — the pair
        view shows this product&apos;s direct trade plus the estimated
        rerouted (indirect) flows between the two.
      </p>
    </div>
  );
}
