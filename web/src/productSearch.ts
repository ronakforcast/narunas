/**
 * Typo-tolerant product search over the HS nomenclature.
 *
 * Matches HS6 codes, HS4 headings and chapter titles by name. Ranking:
 *   exact code > code prefix > name starts-with > all-token prefix >
 *   substring > subsequence (typo-tolerant fallback)
 */
import { HS6_NAMES, HS4_NAMES, HS_CHAPTERS } from "./hs";

export interface SearchHit {
  code: string;
  name: string;
  kind: "hs6" | "heading" | "chapter";
}

const MAX_RESULTS = 10;

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Length of the common leading characters of two strings. */
function commonPrefixLen(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * Minimal span (character window) in which `needle` appears as a
 * subsequence of `hay`, or -1 when it does not. A compact span means
 * the letters cluster like a real word; scattered matches ("medisin"
 * across "Metals: rhodium, semi-manufactured") are rejected.
 */
function subsequenceSpan(needle: string, hay: string): number {
  let best = -1;
  for (let start = 0; start < hay.length; start++) {
    if (hay[start] !== needle[0]) continue;
    let ni = 1;
    let last = start;
    for (
      let hi = start + 1;
      hi < hay.length && ni < needle.length;
      hi++
    ) {
      if (hay[hi] === needle[ni]) {
        ni++;
        last = hi;
      }
    }
    if (ni === needle.length) {
      const span = last - start + 1;
      if (best < 0 || span < best) best = span;
      if (best === needle.length) break;
    }
  }
  return best;
}

interface Entry {
  code: string;
  name: string;
  normName: string;
  kind: SearchHit["kind"];
}

const ENTRIES: Entry[] = [
  ...Object.entries(HS_CHAPTERS).map(([code, name]) => ({
    code,
    name,
    normName: norm(name),
    kind: "chapter" as const,
  })),
  ...Object.entries(HS4_NAMES).map(([code, name]) => ({
    code,
    name,
    normName: norm(name),
    kind: "heading" as const,
  })),
  ...Object.entries(HS6_NAMES).map(([code, name]) => ({
    code,
    name,
    normName: norm(name),
    kind: "hs6" as const,
  })),
];

const CODE_INDEX = new Map(ENTRIES.map((e) => [e.code, e]));

export function searchProducts(query: string): SearchHit[] {
  const q = norm(query);
  if (!q) return [];

  // exact / prefix code match always wins (digits-first typing flow)
  const codeHits: SearchHit[] = [];
  if (/^\d{2,6}$/.test(q)) {
    const exact = CODE_INDEX.get(q);
    if (exact) return [{ code: exact.code, name: exact.name, kind: exact.kind }];
    for (const e of ENTRIES) {
      if (e.code.startsWith(q)) codeHits.push(e);
      if (codeHits.length >= MAX_RESULTS) break;
    }
    if (codeHits.length) return codeHits.slice(0, MAX_RESULTS);
  }

  const tokens = q.split(" ");
  const scored: { hit: SearchHit; score: number }[] = [];
  for (const e of ENTRIES) {
    const words = e.normName.split(" ");
    // word index of the first token match — matches that appear earlier in
    // the name rank higher ("Electronic integrated circuits" beats
    // "Machines … for making integrated circuits")
    let firstIdx = -1;
    for (const w of words) {
      const idx = tokens.findIndex((t) => w.startsWith(t));
      if (idx >= 0) {
        firstIdx = words.indexOf(w);
        break;
      }
    }
    let score = 0;
    if (e.normName === q) {
      score = 120;
    } else if (e.normName.startsWith(q)) {
      score = 100 - e.normName.length * 0.05;
    } else if (firstIdx >= 0 && tokens.every((t) => words.some((w) => w.startsWith(t)))) {
      score = 85 - firstIdx * 2;
    } else if (e.normName.includes(q)) {
      score = 70 - e.normName.indexOf(q) * 0.1;
    } else if (tokens.every((t) => e.normName.includes(t))) {
      score = 60;
    } else if (q.length >= 5) {
      // typo tiers: (a) the query shares most of a real word's start
      // ("medisin" ~ "medicine"/"medicaments"), (b) the query's letters
      // appear as a compact cluster somewhere in the name
      const maxPrefix = Math.max(
        0,
        ...words.map((w) => commonPrefixLen(q, w)),
      );
      if (maxPrefix >= 4 && q.length - maxPrefix <= 3) {
        score = 38 + maxPrefix * 2;
      } else {
        const span = subsequenceSpan(q, e.normName);
        if (span > 0 && span <= q.length + 4) {
          score = 30 + (q.length + 4 - span) * 1.5;
        }
      }
    }
    if (score > 0) scored.push({ hit: { code: e.code, name: e.name, kind: e.kind }, score });
  }
  scored.sort((a, b) => b.score - a.score || a.hit.code.localeCompare(b.hit.code));
  return scored.slice(0, MAX_RESULTS).map((s) => s.hit);
}

/** Find a hit by exact code (after selection, e.g. from URL or CSV). */
export function productByCode(code: string): SearchHit | null {
  const e = CODE_INDEX.get(code);
  return e ? { code: e.code, name: e.name, kind: e.kind } : null;
}
