/** Format a value expressed in millions of USD. */
export function fmtUSD(musd: number): string {
  const abs = Math.abs(musd);
  if (abs >= 1_000_000) return `$${(musd / 1_000_000).toFixed(1)}T`;
  if (abs >= 1_000) return `$${(musd / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}B`;
  if (abs >= 1) return `$${musd.toFixed(abs >= 100 ? 0 : 1)}M`;
  if (abs === 0) return "$0";
  return `$${(musd * 1000).toFixed(0)}K`;
}

/** Format a value expressed in millions of EUR. */
export function fmtEUR(meur: number): string {
  const abs = Math.abs(meur);
  if (abs >= 1000) return `€${(meur / 1000).toFixed(1)}B`;
  if (abs >= 1) return `€${meur.toFixed(abs >= 100 ? 0 : 1)}M`;
  if (abs === 0) return "€0";
  return `€${(meur * 1000).toFixed(0)}K`;
}

/** Compact integer with thousands separators. */
export function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}
