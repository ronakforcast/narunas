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
      fp: [["220300", "Beer: made from malt", 10]],
      tp: [],
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

    await waitFor(() => {
      expect(document.querySelectorAll(".flow-link").length).toBeGreaterThanOrEqual(2);
    });

    // summary shows indirect total from compact data: 1310.1 -> $1.3B
    await waitFor(() => {
      expect(document.querySelectorAll(".sc-row").length).toBeGreaterThan(0);
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
