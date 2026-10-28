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
];

const countriesDoc = {
  countries,
  meta: { baci_version: "test" },
  latest_goods_year: 2024,
  indirect_year: 2024,
};

// compact static pair file for Lithuania (partners keyed by iso3)
const ltuFile = {
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
