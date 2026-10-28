import { describe, expect, it } from "vitest";
import { searchProducts, productByCode } from "./productSearch";

describe("product search: codes", () => {
  it("resolves an exact HS6 code", () => {
    const hits = searchProducts("300440");
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].code).toBe("300440");
    expect(hits[0].kind).toBe("hs6");
    expect(hits[0].name.toLowerCase()).toContain("medicament");
  });

  it("prefixes of a code resolve to the exact heading first", () => {
    const hits = searchProducts("8542");
    // exact heading match wins and returns just that hit
    expect(hits.length).toBe(1);
    expect(hits[0].code).toBe("8542");
    expect(hits[0].kind).toBe("heading");
  });

  it("a 2-digit query finds the chapter", () => {
    const hits = searchProducts("30");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].kind).toBe("chapter");
    expect(hits[0].name.toLowerCase()).toContain("pharmaceutical");
  });

  it("empty queries return nothing", () => {
    expect(searchProducts("")).toEqual([]);
    expect(searchProducts("  ")).toEqual([]);
  });
});

describe("product search: names (typo-tolerant)", () => {
  it("finds medicaments by exact word", () => {
    const hits = searchProducts("medicaments");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.code === "300440")).toBe(true);
  });

  it("finds by partial word (word-prefix tokens)", () => {
    const hits = searchProducts("medica");
    expect(hits.some((h) => h.code.startsWith("3004"))).toBe(true);
  });

  it("survives a typo via subsequence matching", () => {
    const hits = searchProducts("medisin");
    // a typo of "medicine" surfaces medically-relevant products
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => /medic/i.test(h.name))).toBe(true);
  });

  it("multi-token queries AND across tokens, earliest match first", () => {
    const hits = searchProducts("integrated circuits");
    expect(hits.length).toBeGreaterThan(0);
    // the IC heading (match early in the name) beats machinery-for-making-ICs
    expect(hits[0].code.startsWith("8542")).toBe(true);
  });

  it("chapter titles are searchable by name", () => {
    const hits = searchProducts("pharmaceutical");
    expect(hits.some((h) => h.kind === "chapter" && h.code === "30")).toBe(true);
  });
});

describe("productByCode", () => {
  it("round-trips a known code", () => {
    const hit = productByCode("300440");
    expect(hit?.kind).toBe("hs6");
  });

  it("returns null for unknown codes", () => {
    expect(productByCode("000000")).toBeNull();
  });
});
