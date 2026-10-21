import type { Country, PairData, MonthlyData, MonthlyPoint } from "./types";

/**
 * Static data layer — works on GitHub Pages (no backend).
 * - countries + pair data from precomputed gzipped JSON files in /data/
 * - monthly freshness layer calls Eurostat Comext directly from the browser
 *   (CORS: Access-Control-Allow-Origin: *)
 */

interface CountriesDoc {
  countries: Country[];
  meta: Record<string, string>;
  latest_goods_year: number;
  indirect_year: number;
}

let countriesDoc: CountriesDoc | null = null;

export async function fetchCountries(): Promise<Country[]> {
  if (countriesDoc) return countriesDoc.countries;
  const res = await fetch("./data/countries.json");
  if (!res.ok) throw new Error(`countries: ${res.status}`);
  const doc: CountriesDoc = await res.json();
  countriesDoc = doc;
  return doc.countries;
}

const countryCache = new Map<string, Record<string, unknown>>();

async function loadCountryFile(iso: string): Promise<Record<string, any>> {
  const cached = countryCache.get(iso);
  if (cached) return cached;
  const res = await fetch(`./data/pairs/${iso}.json.gz`);
  if (!res.ok) throw new Error(`no data file for ${iso} (${res.status})`);
  let text: string;
  if (
    typeof DecompressionStream !== "undefined" &&
    res.body &&
    (res.headers.get("content-type")?.includes("gzip") || true)
  ) {
    // our files are always .gz; fall back to plain JSON if undecompressable
    try {
      const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
      text = await new Response(stream).text();
    } catch {
      text = await res.text();
    }
  } else {
    text = await res.text();
  }
  const data = JSON.parse(text) as Record<string, any>;
  countryCache.set(iso, data);
  return data;
}

function adaptPair(
  fr: string,
  to: string,
  p: Record<string, any>,
): PairData {
  const meta = countriesDoc?.meta ?? {};
  const g = p.g ?? {};
  const s = p.s ?? {};
  return {
    from: fr,
    to: to,
    goods: {
      years: g.y ?? [],
      from_to: g.ft ?? [],
      to_from: g.tf ?? [],
      from_to_products: (g.fp ?? []).map(
        ([hs6, description, value_musd]: [string, string, number]) => ({
          hs6,
          description,
          value_musd,
        }),
      ),
      to_from_products: (g.tp ?? []).map(
        ([hs6, description, value_musd]: [string, string, number]) => ({
          hs6,
          description,
          value_musd,
        }),
      ),
    },
    services: {
      years: s.y ?? [],
      from_to: s.ft ?? null,
      to_from: s.tf ?? null,
    },
    indirect: {
      year: countriesDoc?.indirect_year ?? 2024,
      from_to: (p.i ?? []).map(
        ([intermediary, estimate_musd, top_products]: [
          string,
          number,
          [string, number][],
        ]) => ({
          intermediary,
          name: null,
          estimate_musd,
          top_products: (top_products ?? []).map(([hs4, value_musd]) => ({
            hs4,
            value_musd,
          })),
        }),
      ),
      to_from: (p.ir ?? []).map(
        ([intermediary, estimate_musd, top_products]: [
          string,
          number,
          [string, number][],
        ]) => ({
          intermediary,
          name: null,
          estimate_musd,
          top_products: (top_products ?? []).map(([hs4, value_musd]) => ({
            hs4,
            value_musd,
          })),
        }),
      ),
    },
    tiva: {
      years: p.t?.years ?? [],
      measures: Object.fromEntries(
        Object.entries(p.t ?? {}).filter(([k]) => k !== "years"),
      ) as Record<string, number[]>,
    },
    meta,
  };
}

export async function fetchPair(fr: string, to: string): Promise<PairData> {
  const partners = await loadCountryFile(fr);
  const p = partners[to];
  if (!p) throw new Error(`no trade data recorded between ${fr} and ${to}`);
  return adaptPair(fr, to, p);
}

// ---------------------------------------------------------------------------
// Monthly freshness — direct browser calls to Eurostat Comext (CORS: *)
// ---------------------------------------------------------------------------

const COMEXT_URL =
  "https://ec.europa.eu/eurostat/api/comext/dissemination/sdmx/2.1/data/" +
  "DS-045409/M.{reporter}.{partner}.TOTAL.2.VALUE_IN_EUROS" +
  "?startPeriod={start}&format=JSON";

function monthsBack(n: number): string {
  const d = new Date();
  let y = d.getFullYear();
  let m = d.getMonth() + 1 - n;
  while (m <= 0) {
    m += 12;
    y -= 1;
  }
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

function parseSdmx(json: any): MonthlyPoint[] {
  const index = json?.dimension?.time?.category?.index;
  const values = json?.value;
  if (!index || !values) return [];
  return Object.entries(index as Record<string, number>)
    .sort((a, b) => a[1] - b[1])
    .filter(([period]) => values[String(index[period])] != null)
    .map(([period]) => ({
      period,
      value_meur: Math.round((Number(values[String(index[period])]) / 1e6) * 10) / 10,
    }));
}

async function fetchDirection(
  reporter: string,
  partner: string,
): Promise<MonthlyPoint[]> {
  const url = COMEXT_URL.replace("{reporter}", reporter)
    .replace("{partner}", partner)
    .replace("{start}", monthsBack(24));
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    return parseSdmx(await res.json());
  } catch {
    return [];
  }
}

export async function fetchMonthly(
  iso2A: string | null,
  iso2B: string | null,
): Promise<MonthlyData | null> {
  if (!iso2A || !iso2B) {
    return { available: false, reason: "no monthly reporting for this pair" };
  }
  const [ab, ba] = await Promise.all([
    fetchDirection(iso2A, iso2B),
    fetchDirection(iso2B, iso2A),
  ]);
  if (ab.length === 0 && ba.length === 0) {
    return {
      available: false,
      reason: "no monthly data reported by either side",
    };
  }
  return {
    available: true,
    currency: "EUR",
    from_to: ab,
    to_from: ba,
    source: "Eurostat Comext (monthly, reported)",
  };
}
