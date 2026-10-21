import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import WorldMap from "./WorldMap";
import FlowChart from "./FlowChart";
import PairPanel from "./PairPanel";
import MonthlyCard from "./MonthlyCard";
import type { Country, PairData } from "./types";

const countries: Country[] = [
  { iso3: "LTU", name: "Lithuania", iso2: "LT" },
  { iso3: "RUS", name: "Russia", iso2: "RU" },
  { iso3: "KAZ", name: "Kazakhstan", iso2: "KZ" },
  { iso3: "DEU", name: "Germany", iso2: "DE" },
];

const pairData: PairData = {
  from: "LTU",
  to: "RUS",
  goods: {
    years: [2023, 2024],
    from_to: [700, 688],
    to_from: [260, 237],
    from_to_products: [
      { hs6: "220300", description: "Beer: made from malt", value_musd: 40 },
    ],
    to_from_products: [],
  },
  services: {
    years: [2024],
    from_to: [755],
    to_from: [181],
  },
  indirect: {
    year: 2024,
    from_to: [
      {
        intermediary: "DEU",
        name: "Germany",
        estimate_musd: 796.3,
        top_products: [{ hs4: "3004", value_musd: 59.8 }],
      },
      {
        intermediary: "KAZ",
        name: "Kazakhstan",
        estimate_musd: 156.6,
        top_products: [{ hs4: "8471", value_musd: 12.0 }],
      },
    ],
    to_from: [
      {
        intermediary: "KAZ",
        name: "Kazakhstan",
        estimate_musd: 70.2,
        top_products: [{ hs4: "2716", value_musd: 9.0 }],
      },
    ],
  },
  tiva: {
    years: [2022],
    measures: { FFD_DVA: [1158.9] },
  },
  meta: { baci_version: "test" },
};

const names = new Map(countries.map((c) => [c.iso3, c.name]));
const flags = new Map(countries.map((c) => [c.iso3, c.iso2 ?? ""]));

/** normalize SSR output for plain-text assertions */
function norm(html: string): string {
  return html.replaceAll("<!-- -->", "").replaceAll("&#x27;", "'");
}

describe("WorldMap rendering (picker mode)", () => {
  it("renders the map with A/B highlights and badges", () => {
    const html = renderToString(
      createElement(WorldMap, {
        known: new Set(countries.map((c) => c.iso3)),
        names,
        selA: "LTU",
        selB: "RUS",
        pairData,
        onPick: () => {},
      }),
    );
    expect(html).toContain("<svg");
    expect(html).toContain("sel-a");
    expect(html).toContain("sel-b");
    // numbered badges for A and B
    expect(html).toContain(">1</text>");
    expect(html).toContain(">2</text>");
  });

  it("renders without pair data (selection state)", () => {
    const html = renderToString(
      createElement(WorldMap, {
        known: new Set(["LTU"]),
        names: new Map([["LTU", "Lithuania"]]),
        selA: "LTU",
        selB: null,
        pairData: null,
        onPick: () => {},
      }),
    );
    expect(html).toContain("<svg");
  });
});

describe("FlowChart rendering (peoplemov-style)", () => {
  it("renders ribbons with intermediary nodes and values", () => {
    const html = renderToString(
      createElement(FlowChart, {
        pairData,
        direction: "ab",
        names,
        flags,
      }),
    );
    expect(norm(html)).toContain("How Lithuania's goods reach Russia");
    // intermediary nodes with values
    expect(html).toContain("Germany");
    expect(html).toContain("$796M");
    expect(html).toContain("Kazakhstan");
    expect(html).toContain("$157M");
    // direct ribbon present
    expect(norm(html)).toContain("$688M direct");
    // ribbons are svg paths
    expect(html).toContain("flow-link");
  });

  it("renders the reverse direction with reversed intermediaries", () => {
    const html = renderToString(
      createElement(FlowChart, {
        pairData,
        direction: "ba",
        names,
        flags,
      }),
    );
    expect(norm(html)).toContain("How Russia's goods reach Lithuania");
    // reverse indirect value total: 70.2
    expect(html).toContain("$70.2M");
  });
});

describe("MonthlyCard rendering", () => {
  it("renders ytd totals and bars when available", () => {
    const html = renderToString(
      createElement(MonthlyCard, {
        data: {
          available: true,
          currency: "EUR",
          from_to: [
            { period: "2026-07", value_meur: 20.5 },
            { period: "2026-08", value_meur: 21.0 },
          ],
          to_from: [],
          source: "Eurostat Comext (monthly, reported)",
        },
        nameA: "Lithuania",
        nameB: "Russia",
      }),
    );
    expect(html).toContain("Recent months");
    expect(html).toContain("2026 so far");
    expect(html).toContain("monthly-bars");
    expect(norm(html)).toContain("Lithuania → Russia");
  });

  it("renders nothing when unavailable", () => {
    const html = renderToString(
      createElement(MonthlyCard, {
        data: { available: false },
        nameA: "A",
        nameB: "B",
      }),
    );
    expect(html).toBe("");
  });
});

describe("PairPanel rendering", () => {
  it("shows the indirect-trade section with intermediaries and bars", () => {
    const html = renderToString(
      createElement(PairPanel, {
        data: pairData,
        countries,
        onReset: () => {},
        onSwap: () => {},
      }),
    );
    expect(html).toContain("Indirect trade via third countries");
    expect(html).toContain("Germany");
    expect(html).toContain("$796M");
    expect(html).toContain("im-bar");
    expect(html).toContain("Kazakhstan");
    expect(html).toContain("Direct goods");
    expect(html).toContain("$688M");
    expect(html).toContain("Value added (OECD TiVA)");
  });
});
