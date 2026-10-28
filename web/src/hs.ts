/**
 * HS nomenclature accessor — names for HS6 codes, HS4 headings and
 * chapters, generated from the official BACI/WCO metadata by
 * scripts/gen_hs6_names.py into assets/hs6-names.json.
 */
import raw from "./assets/hs6-names.json";

const doc = raw as unknown as {
  hs6: Record<string, string>;
  hs4: Record<string, string>;
  chapters: Record<string, string>;
};

export const HS6_NAMES = doc.hs6;
export const HS4_NAMES = doc.hs4;
export const HS_CHAPTERS = doc.chapters;

export function hs6Name(code: string): string | null {
  return HS6_NAMES[code] ?? null;
}

export function hs4Name(code: string): string | null {
  return HS4_NAMES[code] ?? null;
}

export function chapterTitle(ch2: string): string | null {
  return HS_CHAPTERS[ch2] ?? null;
}

/** "Chapter 30 · Pharmaceutical products" style breadcrumb label. */
export function chapterOf(hs6: string): { code: string; title: string } | null {
  const title = HS_CHAPTERS[hs6.slice(0, 2)];
  return title ? { code: hs6.slice(0, 2), title } : null;
}
