import type { PairData } from "./types";
import { fmtUSD } from "./format";

/** The answer to "who sells more to whom", counting direct and indirect. */
export default function BalanceBanner({
  data,
  nameA,
  nameB,
  flagA,
  flagB,
}: {
  data: PairData;
  nameA: string;
  nameB: string;
  flagA: string;
  flagB: string;
}) {
  const latest = data.goods.years.length - 1;
  const dAB = data.goods.from_to[latest] ?? 0; // direct A -> B
  const dBA = data.goods.to_from[latest] ?? 0; // direct B -> A
  const iAB = data.indirect.from_to.reduce(
    (s, x) => s + x.estimate_musd,
    0,
  );
  const iBA = data.indirect.to_from.reduce(
    (s, x) => s + x.estimate_musd,
    0,
  );
  const out = dAB + iAB;
  const inc = dBA + iBA;
  const diff = out - inc;
  const isExport = diff > 0;
  const balanced = Math.abs(diff) < 1;

  const verdict = balanced
    ? `${flagA} ${nameA} and ${flagB} ${nameB} trade evenly`
    : isExport
      ? `${flagA} ${nameA} exports more to ${flagB} ${nameB}`
      : `${flagA} ${nameA} imports more from ${flagB} ${nameB}`;

  return (
    <section
      className={`balance-banner ${balanced ? "" : isExport ? "export" : "import"}`}
    >
      <div className="balance-verdict">{verdict}</div>
      <div className="balance-detail">
        <span className="bal-out">
          out {fmtUSD(out)}{" "}
          <span className="bal-split">
            (direct {fmtUSD(dAB)} + via other countries {fmtUSD(iAB)}, est.)
          </span>
        </span>
        <span className="bal-sep">·</span>
        <span className="bal-in">
          in {fmtUSD(inc)}{" "}
          <span className="bal-split">
            (direct {fmtUSD(dBA)} + via others {fmtUSD(iBA)}, est.)
          </span>
        </span>
        <span className="bal-sep">·</span>
        <span className={`bal-diff ${isExport ? "pos" : "neg"}`}>
          {balanced
            ? "no surplus either way"
            : `${isExport ? "trade surplus" : "trade deficit"} ${fmtUSD(
                Math.abs(diff),
              )} for ${nameA}`}
        </span>
      </div>
      <p className="balance-note">
        {data.indirect.year} figures. "Via other countries" is an upper-bound
        estimate; details under methodology.
      </p>
    </section>
  );
}
