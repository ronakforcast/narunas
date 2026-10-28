import { describe, expect, it } from "vitest";
import {
  growthPct,
  unitPricePerKg,
  byHeading,
  byChapter,
  sortProducts,
  GROWTH_MIN_MUSD,
} from "./products";
import type { ProductRef } from "./types";

const P = (o: Partial<ProductRef>): ProductRef => ({
  hs6: "000000",
  value_musd: 0,
  ...o,
});

describe("growthPct", () => {
  it("computes year-over-year change", () => {
    expect(growthPct(P({ value_musd: 125, prev_musd: 100 }))).toBe(25);
    expect(growthPct(P({ value_musd: 80, prev_musd: 100 }))).toBe(-20);
  });

  it("null when the product is new to the lane", () => {
    expect(growthPct(P({ value_musd: 10 }))).toBeNull();
    expect(growthPct(P({ value_musd: 10, prev_musd: null }))).toBeNull();
    expect(growthPct(P({ value_musd: 10, prev_musd: 0 }))).toBeNull();
  });
});

describe("unitPricePerKg", () => {
  it("converts millions USD and metric tons to $/kg", () => {
    // 100M USD / 50,000 t = $2/kg
    expect(unitPricePerKg(P({ value_musd: 100, qty_t: 50_000 }))).toBeCloseTo(
      2,
      6,
    );
  });

  it("null when quantity is unreported", () => {
    expect(unitPricePerKg(P({ value_musd: 100 }))).toBeNull();
    expect(unitPricePerKg(P({ value_musd: 100, qty_t: 0 }))).toBeNull();
    expect(unitPricePerKg(P({ value_musd: 100, qty_t: null }))).toBeNull();
  });
});

describe("hierarchy rollup", () => {
  const products = [
    P({ hs6: "854231", value_musd: 100, prev_musd: 80, qty_t: 50 }),
    P({ hs6: "854239", value_musd: 60, prev_musd: 60, qty_t: 30 }),
    P({ hs6: "847130", value_musd: 40, prev_musd: 50, qty_t: 20 }),
  ];

  it("aggregates to HS4 headings", () => {
    const heads = byHeading(products);
    const ic = heads.find((h) => h.code === "8542");
    expect(ic?.value_musd).toBe(160);
    expect(ic?.prev_musd).toBe(140);
    expect(ic?.qty_t).toBe(80);
    expect(ic?.count).toBe(2);
  });

  it("aggregates to chapters", () => {
    const chs = byChapter(products);
    expect(chs.length).toBe(2); // 85 and 84
    expect(chs[0].code).toBe("85");
    expect(chs[0].value_musd).toBe(160);
    expect(chs[1].code).toBe("84");
    expect(chs[1].value_musd).toBe(40);
  });
});

describe("sortProducts", () => {
  const a = P({ hs6: "000001", value_musd: 100, prev_musd: 90 }); // +11%
  const b = P({ hs6: "000002", value_musd: 50, prev_musd: 10 }); // +400%
  const c = P({ hs6: "000003", value_musd: 80, prev_musd: 100 }); // -20%
  const d = P({ hs6: "000004", value_musd: 0.1, prev_musd: 0.001 }); // huge % but tiny lane
  const list = [a, b, c, d];

  it("sorts by 2024 value", () => {
    expect(sortProducts(list, "value").map((p) => p.hs6)).toEqual([
      "000001",
      "000003",
      "000002",
      "000004",
    ]);
  });

  it("growth sort honors the minimum-value guard", () => {
    const sorted = sortProducts(list, "growth");
    // d is below GROWTH_MIN_MUSD, so it must not win despite +9900%
    expect(sorted[0].hs6).toBe("000002");
    expect(sorted.indexOf(d)).toBeGreaterThan(0);
  });

  it("price sort ranks by unit value", () => {
    const cheap = P({ hs6: "000009", value_musd: 10, qty_t: 100_000 }); // $0.10/kg
    const dear = P({ hs6: "000008", value_musd: 10, qty_t: 1 }); // $10,000/kg
    const sorted = sortProducts([cheap, dear], "price");
    expect(sorted[0].hs6).toBe("000008");
  });

  it("GROWTH_MIN_MUSD is the documented guard", () => {
    expect(GROWTH_MIN_MUSD).toBe(0.5);
  });
});
