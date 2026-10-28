export interface Country {
  iso3: string;
  name: string;
  iso2: string | null;
}

export interface ProductRef {
  hs6?: string;
  hs4?: string;
  description?: string | null;
  value_musd: number;
  /** previous-year value for growth (USD millions), null when absent */
  prev_musd?: number | null;
  /** quantity in metric tons, null when unreported by the source */
  qty_t?: number | null;
}

export interface Intermediary {
  intermediary: string;
  name: string | null;
  estimate_musd: number;
  top_products: { hs4: string; value_musd: number }[];
}

export interface PairData {
  from: string;
  to: string;
  goods: {
    years: number[];
    from_to: number[];
    to_from: number[];
    from_to_products: ProductRef[];
    to_from_products: ProductRef[];
    /** total HS6 products traded in each direction's lane */
    from_to_n?: number | null;
    to_from_n?: number | null;
  };
  services: {
    years: number[];
    from_to: number[] | null;
    to_from: number[] | null;
  };
  indirect: {
    year: number;
    from_to: Intermediary[];
    to_from: Intermediary[];
  };
  tiva: {
    years: number[];
    measures: Record<string, number[]>;
  };
  meta: Record<string, string>;
}

export interface MonthlyPoint {
  period: string; // "2026-08"
  value_meur: number;
}

export interface MonthlyData {
  available: boolean;
  currency?: string;
  from?: string;
  to?: string;
  from_to?: MonthlyPoint[];
  to_from?: MonthlyPoint[];
  reason?: string;
  source?: string;
}
