/// <reference types="vitest" />
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { gzipSync } from "node:zlib";
import { createElement } from "react";
import App from "./App";
import type { Country } from "./types";

const countries: Country[] = [
  { iso3: "LTU", name: "Lithuania", iso2: "LT" },
  { iso3: "IND", name: "India", iso2: "IN" },
  { iso3: "RUS", name: "Russia", iso2: "RU" },
  { iso3: "DEU", name: "Germany", iso2: "DE" },
  { iso3: "USA", name: "United States", iso2: "US" },
  { iso3: "CHE", name: "Switzerland", iso2: "CH" },
];

const countriesDoc = {
  countries,
  meta: { baci_version: "test" },
  latest_goods_year: 2024,
  indirect_year: 2024,
};

// compact static pair file for Lithuania (partners keyed by iso3)
const ltuFile: Record<
  string,
  {
    g: Record<string, unknown>;
    s?: Record<string, unknown>;
    i?: unknown[];
    ir?: unknown[];
  }
> = {
  IND: {
    g: {
      y: [2023, 2024],
      ft: [140, 148.7],
      tf: [230, 243.4],
      // [hs6, value_2024, value_2023, qty_tons]
      fp: [["220300", 10, 8, 10000]],
      tp: [],
      fn: 1,
      tn: 0,
    },
    s: { y: [2023, 2024], ft: [124.1, 132.0], tf: [99.6, 117.9] },
    i: [["DEU", 1310.1, [["3004", 60]]]],
    ir: [["DEU", 500.0, [["3004", 20]]]],
  },
  // USA partner for the product-first funnel test
  USA: {
    g: {
      y: [2023, 2024],
      ft: [140, 148.7],
      tf: [230, 243.4],
      fp: [["220300", 10, 8, 10000]],
      tp: [],
      fn: 1,
      tn: 0,
    },
    s: { y: [2023, 2024], ft: [124.1, 132.0], tf: [99.6, 117.9] },
    i: [],
    ir: [],
  },
};

// compact static file for India: several partners so the ranking has content
const indFile = {
  LTU: {
    g: { y: [2023, 2024], ft: [230, 243.4], tf: [140, 148.7], fp: [], tp: [] },
  },
  RUS: {
    g: { y: [2023, 2024], ft: [30000, 38000], tf: [9000, 11000], fp: [], tp: [] },
  },
  DEU: {
    g: { y: [2023, 2024], ft: [8000, 8500], tf: [12000, 13000], fp: [], tp: [] },
  },
};

// USA as an LTU partner (for the product-first funnel test) — declared above

// global product file for heading 3004 (medicaments)
const productFile = {
  code: "3004",
  kind: "hs4",
  w: [492152.3, 469084.8],
  im: [
    [
      "USA",
      94512.3,
      90000.0,
      1200.5,
      19.2,
      [["CHE", 40000.0], ["IND", 30000.0], ["IRL", 20000.0]],
    ],
    ["CHE", 47301.1, 45000.0, 900.2, 9.6, [["SVN", 20000.0]]],
  ],
  ex: [["DEU", 64700.9, 60000.0], ["CHE", 44269.9, 41000.0]],
  c: [["300490", 400667.5, [["USA", 90000.0], ["CHE", 30000.0]]]],
};

// SDMX-JSON like Eurostat returns
const sdmx = {
  dimension: { time: { category: { index: { "2026-07": 0, "2026-08": 1 } } } },
  value: { "0": 20500000, "1": 21000000 },
};

function findCountryPath(iso: string): SVGPathElement | null {
  return document.querySelector(`path[data-iso="${iso}"]`);
}

describe("App integration: static data flow (Lithuania and India)", () => {
  beforeEach(() => {
    cleanup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("data/countries.json")) {
          return new Response(JSON.stringify(countriesDoc), { status: 200 });
        }
        if (url.includes("data/pairs/LTU.json.gz")) {
          return new Response(
            gzipSync(Buffer.from(JSON.stringify(ltuFile))),
            { status: 200 },
          );
        }
        if (url.includes("data/pairs/IND.json.gz")) {
          return new Response(
            gzipSync(Buffer.from(JSON.stringify(indFile))),
            { status: 200 },
          );
        }
        if (url.includes("data/products/3004.json.gz")) {
          return new Response(
            gzipSync(Buffer.from(JSON.stringify(productFile))),
            { status: 200 },
          );
        }
        if (url.includes("eurostat")) {
          return new Response(JSON.stringify(sdmx), { status: 200 });
        }
        if (url.includes("proxy.cors.dev")) {
          return new Response(
            `<?xml version="1.0" encoding="UTF-8" ?>
            <rss version="2.0"><channel>
              <item>
                <title>Lithuania hopeful India-EU FTA effective during its 2027 presidency</title>
                <link>https://example.com/fta</link>
                <pubDate>Thu, 20 Aug 2026 09:31:00 GMT</pubDate>
              </item>
              <item>
                <title>India and Lithuania expand rail trade corridor</title>
                <link>https://example.com/rail</link>
                <pubDate>Wed, 19 Aug 2026 17:01:00 GMT</pubDate>
              </item>
            </channel></rss>`,
            { status: 200 },
          );
        }
        if (url.includes("gdeltproject")) {
          return new Response(
            JSON.stringify({
              articles: [
                {
                  title: "Lithuania and India sign new trade deal",
                  url: "https://example.com/1",
                  domain: "example.com",
                  seendate: "20261018T000000Z",
                },
                {
                  title: "India exports rise sharply",
                  url: "https://example.com/2",
                  domain: "example.com",
                  seendate: "20261017T000000Z",
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response("{}", { status: 404 });
      }),
    );
  });

  afterEach(cleanup);

  it("selects A and B, renders flow chart from static gz data", async () => {
    render(createElement(App));

    await waitFor(
      () => {
        expect(findCountryPath("LTU")).not.toBeNull();
      },
      { timeout: 3000 },
    );

    fireEvent.click(findCountryPath("LTU")!);
    await waitFor(() => {
      expect(document.querySelector(".country.sel-a")).not.toBeNull();
    });

    fireEvent.click(findCountryPath("IND")!);
    await waitFor(() => {
      expect(document.querySelector(".country.sel-b")).not.toBeNull();
    });

    // balance banner: the verdict up top
    await waitFor(() => {
      const banner = document.querySelector(".balance-banner");
      expect(banner).not.toBeNull();
      expect(banner!.textContent).toContain("exports more to");
      expect(banner!.textContent).toContain("India");
      expect(banner!.textContent).toContain("trade surplus");
    });

    // flow chart rendered from the gzipped static data
    await waitFor(() => {
      const title = document.querySelector(".flow-title");
      expect(title).not.toBeNull();
      expect(title!.textContent).toContain("Lithuania");
      expect(title!.textContent).toContain("India");
    });

    // involved country names are labeled on the globe
    await waitFor(() => {
      const map = document.querySelector("svg.map");
      expect(map).not.toBeNull();
      expect(map!.textContent).toContain("Lithuania");
      expect(map!.textContent).toContain("India");
      expect(map!.textContent).toContain("Germany");
    });

    await waitFor(() => {
      expect(document.querySelectorAll(".flow-link").length).toBeGreaterThanOrEqual(2);
    });

    // summary shows indirect total from compact data: 1310.1 -> $1.3B
    await waitFor(() => {
      expect(document.querySelectorAll(".sc-row").length).toBeGreaterThan(0);
    });

    // trade news card: Bing News RSS through the cors.dev proxy
    await waitFor(() => {
      const news = document.querySelector(".news-card");
      expect(news).not.toBeNull();
      expect(news!.textContent).toContain("Trade in the news");
      expect(news!.textContent).toContain(
        "Lithuania hopeful India-EU FTA effective during its 2027 presidency",
      );
      expect(news!.textContent).toContain("Aug 20");
    });

    // monthly layer arrives from the (mocked) Eurostat call
    await waitFor(() => {
      expect(document.querySelector(".monthly")).not.toBeNull();
    });

    // top partners: both countries' rankings from their static files
    await waitFor(() => {
      const tp = document.querySelector(".tp-card");
      expect(tp).not.toBeNull();
      expect(tp!.textContent).toContain("Top trade partners");
      // Lithuania's only fixture partner is India -> rank 1, highlighted
      expect(tp!.textContent).toContain("India");
      expect(document.querySelector(".tp-col.a li.tp-hit")).not.toBeNull();
      // India's list ranks Russia and Germany
      expect(tp!.textContent).toContain("Russia");
      expect(tp!.textContent).toContain("Germany");
      expect(tp!.textContent).toContain("$49B");
    });

    // product intelligence: what each side sells the other
    await waitFor(() => {
      const pr = document.querySelector(".pr-card");
      expect(pr).not.toBeNull();
      expect(pr!.textContent).toContain("Product intelligence");
      // search box for the product finder
      expect(pr!.querySelector(".pr-search")).not.toBeNull();
      // direction tab for the active side (A -> B exports)
      expect(pr!.textContent).toContain("Lithuania");
      expect(pr!.textContent).toContain("India");
      // product row: name (joined from the HS asset), value, growth, price
      expect(pr!.textContent).toContain("Beer: made from malt");
      expect(pr!.textContent).toContain("$10.0M");
      expect(pr!.textContent).toContain("▲25%");
      expect(pr!.textContent).toContain("$1.00/kg");
      // coverage line reflects the lane counts
      expect(pr!.textContent).toContain("top 1 of 1 products");
      // sort controls + csv export button
      expect(pr!.querySelectorAll(".pr-sorts button").length).toBe(3);
      expect(document.querySelector(".csv-btn")).not.toBeNull();
      // indirect subsection aggregates the fixture intermediary product
      const subs = document.querySelectorAll(".pr-sub");
      expect(subs.length).toBe(1);
      expect(subs[0].textContent).toContain("indirect");
      expect(pr!.textContent).toContain("Medicaments");
    });
  });

  it("starts from a product: search, global view, market, pair", async () => {
    render(createElement(App));

    await waitFor(
      () => {
        expect(findCountryPath("LTU")).not.toBeNull();
      },
      { timeout: 3000 },
    );

    // type a product in the hero search and pick the (exact) heading hit
    const input = document.querySelector(".hero-product-search input");
    expect(input).not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(input, "3004");
    input!.dispatchEvent(new Event("input", { bubbles: true }));
    await waitFor(() => {
      expect(document.querySelector(".pr-suggest")).not.toBeNull();
    });
    document
      .querySelector(".pr-suggest li")!
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    // global product view renders from the mocked product file
    await waitFor(() => {
      const pg = document.querySelector(".pg-card");
      expect(pg).not.toBeNull();
      expect(pg!.textContent).toContain("Medicaments");
      expect(pg!.textContent).toContain("HS 3004");
      expect(pg!.textContent).toContain("$492B");
      expect(pg!.textContent).toContain("▲4.9%");
      // importer markets with values, share and suppliers
      expect(pg!.textContent).toContain("United States");
      expect(pg!.textContent).toContain("$95B");
      expect(pg!.textContent).toContain("19.2%");
      expect(pg!.textContent).toContain("from");
      // exporters and the hs6 children drill
      expect(pg!.textContent).toContain("Germany");
      expect(pg!.textContent).toContain("$65B");
    });

    // click the top importing market -> becomes country B
    const market = document.querySelector(".pg-list li");
    expect(market!.textContent).toContain("United States");
    fireEvent.click(market!);
    await waitFor(() => {
      expect(document.querySelector(".country.sel-b")).not.toBeNull();
      expect(document.querySelector(".status")!.textContent).toContain(
        "is your market B",
      );
    });

    // pick A on the map -> the pair loads (product-first funnel complete)
    fireEvent.click(findCountryPath("LTU")!);
    await waitFor(() => {
      expect(document.querySelector(".pr-card")).not.toBeNull();
      expect(document.querySelector(".country.sel-a")).not.toBeNull();
    });
    // the product view is replaced by the pair view
    expect(document.querySelector(".pg-card")).toBeNull();
  });

  it("ignores clicking a country that is already selected", async () => {
    render(createElement(App));
    await waitFor(
      () => {
        expect(findCountryPath("LTU")).not.toBeNull();
      },
      { timeout: 3000 },
    );
    fireEvent.click(findCountryPath("LTU")!);
    await waitFor(() => {
      expect(document.querySelector(".country.sel-a")).not.toBeNull();
    });
    fireEvent.click(findCountryPath("LTU")!);
    await new Promise((r) => setTimeout(r, 100));
    expect(document.querySelector(".country.sel-b")).toBeNull();
    expect(document.querySelector(".flow-title")).toBeNull();
  });
});
