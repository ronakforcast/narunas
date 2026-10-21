import { useEffect, useState } from "react";
import { fetchTopPartners, type TopPartner } from "./api";
import { fmtUSD } from "./format";

function emojiOf(flags: Map<string, string>, iso3: string): string {
  const iso2 = flags.get(iso3);
  if (!iso2 || iso2.length !== 2) return "";
  return String.fromCodePoint(
    ...iso2
      .toUpperCase()
      .split("")
      .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

function PartnerColumn({
  countryIso,
  countryName,
  otherIso,
  otherName,
  names,
  flags,
  accent,
}: {
  countryIso: string;
  countryName: string;
  otherIso: string;
  otherName: string;
  names: Map<string, string>;
  flags: Map<string, string>;
  accent: "a" | "b";
}) {
  const [list, setList] = useState<TopPartner[] | null>(null);

  useEffect(() => {
    let alive = true;
    setList(null);
    fetchTopPartners(countryIso)
      .then((l) => {
        if (alive) setList(l);
      })
      .catch(() => {
        if (alive) setList([]);
      });
    return () => {
      alive = false;
    };
  }, [countryIso]);

  const top = list?.slice(0, 10) ?? [];
  const other = list?.find((x) => x.iso3 === otherIso) ?? null;

  return (
    <div className={`tp-col ${accent}`}>
      <h4>
        {emojiOf(flags, countryIso)} {countryName}
      </h4>
      {list == null ? (
        <p className="tp-note">loading…</p>
      ) : top.length === 0 ? (
        <p className="tp-note">no partner data</p>
      ) : (
        <>
          <ol className="tp-list">
            {top.map((p) => (
              <li
                key={p.iso3}
                className={p.iso3 === otherIso ? "tp-hit" : undefined}
                title={`sells ${fmtUSD(p.exports_musd)} · buys ${fmtUSD(
                  p.imports_musd,
                )}`}
              >
                <span className="tp-rank">{p.rank}</span>
                <span className="tp-flag">{emojiOf(flags, p.iso3)}</span>
                <span className="tp-name">
                  {names.get(p.iso3) ?? p.iso3}
                </span>
                <span className="tp-total">{fmtUSD(p.total_musd)}</span>
              </li>
            ))}
          </ol>
          {other && other.rank > 10 && (
            <p className="tp-foot">
              {emojiOf(flags, otherIso)} {otherName} is {countryName}&apos;s #
              {other.rank} partner, {fmtUSD(other.total_musd)}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function TopPartners({
  isoA,
  isoB,
  nameA,
  nameB,
  names,
  flags,
  year,
}: {
  isoA: string;
  isoB: string;
  nameA: string;
  nameB: string;
  names: Map<string, string>;
  flags: Map<string, string>;
  year: number;
}) {
  return (
    <section className="card tp-card">
      <h3>
        Top trade partners{" "}
        <span className="year">
          goods · {year} · ranked by exports + imports
        </span>
      </h3>
      <div className="tp-grid">
        <PartnerColumn
          countryIso={isoA}
          countryName={nameA}
          otherIso={isoB}
          otherName={nameB}
          names={names}
          flags={flags}
          accent="a"
        />
        <PartnerColumn
          countryIso={isoB}
          countryName={nameB}
          otherIso={isoA}
          otherName={nameA}
          names={names}
          flags={flags}
          accent="b"
        />
      </div>
    </section>
  );
}
