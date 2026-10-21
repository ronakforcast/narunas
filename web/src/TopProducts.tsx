import type { PairData, ProductRef } from "./types";
import { fmtUSD } from "./format";

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
              <span className="pr-desc">
                {p.description ?? `HS ${p.hs6}`}
              </span>
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

export default function TopProducts({
  pairData,
  nameA,
  nameB,
  flagA,
  flagB,
}: {
  pairData: PairData;
  nameA: string;
  nameB: string;
  flagA: string;
  flagB: string;
}) {
  const latest = pairData.goods.years.length - 1;
  const totalAB = pairData.goods.from_to[latest] ?? 0; // A -> B
  const totalBA = pairData.goods.to_from[latest] ?? 0; // B -> A
  return (
    <section className="card pr-card">
      <h3>
        Top imports &amp; exports{" "}
        <span className="year">
          goods · {pairData.indirect.year} · what they buy and sell each other
        </span>
      </h3>
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
    </section>
  );
}
