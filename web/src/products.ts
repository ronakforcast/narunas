/**
 * Product analytics — growth, unit price, hierarchy aggregation.
 * Pure functions over the pair's direct product entries.
 */
import type { ProductRef } from "./types";

/** Minimum 2024 lane value for a product to count in growth sorting.
 * Guards against tiny bases producing absurd percentages. */
export const GROWTH_MIN_MUSD = 0.5;

/**
 * Year-over-year growth in percent. `null` when the product is new to
 * the lane (no earlier value) — callers render that as "new".
 */
export function growthPct(p: ProductRef): number | null {
  const prev = p.prev_musd;
  if (prev == null || prev === 0) return null;
  return ((p.value_musd - prev) / prev) * 100;
}

/**
 * Average unit value in $/kg for the lane: value (USD millions) divided
 * by quantity (metric tons). `null` when quantity is unreported — BACI
 * records no weight for some products, and prices are never comparable
 * across different products anyway.
 */
export function unitPricePerKg(p: ProductRef): number | null {
  const qty = p.qty_t;
  if (qty == null || qty <= 0) return null;
  return (p.value_musd * 1e6) / (qty * 1000);
}

/** Share of the direction's total goods value, in percent (>= 1 shown). */
export function laneShare(p: ProductRef, total: number): number | null {
  if (total <= 0) return null;
  return (p.value_musd / total) * 100;
}

export interface HierarchyNode {
  code: string; // hs4 or hs2
  value_musd: number;
  prev_musd: number;
  qty_t: number;
  count: number; // how many top-products rolled up here
}

function rollup(
  products: ProductRef[],
  keyOf: (hs6: string) => string,
): HierarchyNode[] {
  const m = new Map<string, HierarchyNode>();
  for (const p of products) {
    if (!p.hs6) continue;
    const key = keyOf(p.hs6);
    const node = m.get(key) ?? {
      code: key,
      value_musd: 0,
      prev_musd: 0,
      qty_t: 0,
      count: 0,
    };
    node.value_musd += p.value_musd;
    node.prev_musd += p.prev_musd ?? 0;
    node.qty_t += p.qty_t ?? 0;
    node.count += 1;
    m.set(key, node);
  }
  return [...m.values()].sort((a, b) => b.value_musd - a.value_musd);
}

/** Aggregate a direction's products up to HS4 headings. */
export function byHeading(products: ProductRef[]): HierarchyNode[] {
  return rollup(products, (hs6) => hs6.slice(0, 4));
}

/** Aggregate a direction's products up to 2-digit chapters. */
export function byChapter(products: ProductRef[]): HierarchyNode[] {
  return rollup(products, (hs6) => hs6.slice(0, 2));
}

/** Sort modes for the product table. */
export type ProductSort = "value" | "growth" | "price";

export function sortProducts(
  products: ProductRef[],
  sort: ProductSort,
): ProductRef[] {
  const copy = [...products];
  if (sort === "value") {
    copy.sort((a, b) => b.value_musd - a.value_musd);
  } else if (sort === "growth") {
    // only meaningful lanes: above the value guard; new products last
    copy.sort((a, b) => {
      const ga = a.value_musd >= GROWTH_MIN_MUSD ? growthPct(a) : null;
      const gb = b.value_musd >= GROWTH_MIN_MUSD ? growthPct(b) : null;
      if (ga == null && gb == null) return b.value_musd - a.value_musd;
      if (ga == null) return 1;
      if (gb == null) return -1;
      return gb - ga;
    });
  } else {
    copy.sort((a, b) => (unitPricePerKg(b) ?? -1) - (unitPricePerKg(a) ?? -1));
  }
  return copy;
}
