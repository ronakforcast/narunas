# Trade Flow Explorer

A local web tool for exploring **direct and indirect trade between two countries**.

Pick two countries on a world map and see:

- **Direct trade** — goods exports both ways (CEPII BACI, reconciled customs data,
  2012–2024), with product breakdowns, plus direct services trade
  (WTO–OECD BaTIS, 2005–2024).
- **Indirect trade** — estimated goods flows routed via third countries
  (A → intermediary → B), visualized as arcs through the intermediary, ranked,
  with the top shared product headings. Computed for 2022–2024 from BACI.
- **Value-added links** — OECD TiVA measures of how much of one country's
  value added ends up in the other's final demand through all routes
  (1995–2022, ~3-year lag).

All data is self-hosted in SQLite: no API keys, no rate limits, works offline
after the one-time download.

## Quick start

```bash
make setup          # venv + pip install; npm install for the frontend
make fetch          # download BACI (~1.3 GB) + BaTIS (~0.5 GB) + TiVA (~150 MB)
make build-db       # build data/trade.db (~4 min)
make build-indirect # precompute indirect-trade table (~2.5 min)
make run            # build frontend + serve on http://localhost:8765
```

Then open **http://localhost:8765**, click two countries (or use the search box).

## How the indirect estimate works

For a country pair (A, B) and candidate intermediary C:

```
estimate(A, B, C) = Σ over HS4 product headings k of
                    min( exports(A → C, k), exports(C → B, k) )
```

This is the shared-product transshipment indicator used in the sanctions
re-routing literature (e.g. the EBRD/CEPR "Eurasian Roundabout" and Brookings
transshipment analyses). **It is an upper-bound estimate**: an intermediary
that simply consumes A's exports on the same product headings will also be
counted. Use it as a routing-exposure signal, next to the TiVA value-added
measures, which capture the true embodied flows.

## Example: Lithuania ↔ Russia

Direct goods 2024: LTU → RUS ≈ **$688M**, RUS → LTU ≈ **$237M** (down from
pre-sanctions levels). Top indirect routes for LTU → RUS include Germany,
Poland, the Netherlands, Latvia, Kazakhstan and Türkiye — the value-chain
hubs plus the classic re-routing corridors. TiVA 2022: Lithuania's value added
embodied in Russia's final demand ≈ **$1.16B**.

## Data sources

| Source | What | Vintage | License |
|---|---|---|---|
| [CEPII BACI](https://www.cepii.fr/CEPII/en/bdd_modele/bdd_modele_item.asp?id=37) HS12 | Goods, bilateral, HS6, reconciled | V202601 (through 2024) | Etalab 2.0 |
| [WTO–OECD BaTIS](https://www.wto.org/english/res_e/statis_e/trade_datasets_e.htm) BPM6 | Services, bilateral, balanced | Dec 2025 (through 2024) | ODbL |
| [OECD TiVA](https://www.oecd.org/en/tiva.html) 2025 edition | Value-added indicators | through 2022 | free |

Refresh: re-run `make fetch && make build-db && make build-indirect` once a year
when BACI/BaTIS publish new versions (update the URLs in `scripts/fetch_data.py`).

## Development

```bash
make test           # pytest (Python) + vitest (frontend)
make -C web dev     # Vite dev server with /api proxied to :8765
```

### Design system

UI/UX guidance comes from the [`ui-ux-pro-max`](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
agent skill (installed at `.claude/skills/ui-ux-pro-max/`). The generated
system tokens live in `design-system/trade-flow-explorer/MASTER.md` —
typography: Fira Sans (UI) + Fira Code (numeric/data), dark data-dense
dashboard style, amber/blue/violet semantic colors, SVG icons (no emoji),
visible focus rings, 4.5:1 contrast, and `prefers-reduced-motion` support.
To regenerate: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py
"<query>" --design-system` (see the skill's SKILL.md).

Project layout:

```
scripts/fetch_data.py      download all raw sources (cached, resumable)
scripts/build_db.py        BACI + BaTIS + TiVA -> data/trade.db
scripts/build_indirect.py  indirect-trade precompute (numpy)
server/                    FastAPI: /api/countries, /api/pair
web/                       React + D3 world map frontend
tests/                     pytest + vitest suites
```

## Verification (performed 2026-10-21)

- **Cross-source check, direct trade:** Eurostat Comext reports Lithuania's
  exports to Russia 2024 = **€635.4M** ≈ $686M — our BACI value is $688.2M
  (**-0.3% difference**).
- **Sanctions-era collapse visible:** LTU → RUS goods fell from ~$5B (2021)
  to $688M (2024) — the pre/post-2022 break is clearly present in the data.
- **World total 2024:** $22.9T (BACI FOB-reconciled; ~5% below the headline
  WTO figure as expected after CIF deduplication).
- **Indirect plausibility:** LTU → RUS top intermediaries include the expected
  value-chain hubs (DEU, POL, NLD) and the documented re-routing corridors
  (KAZ, TUR, LVA) — see the EBRD/CEPR "Eurasian Roundabout" literature.
- **Automated:** `make test` runs 16 pytest cases (synthetic-fixture math,
  API shape, real-data sanity) + 11 vitest frontend cases — all passing.

## What's live vs annual

- **Annual reconciled data (2024)** — BACI goods, BaTIS services, TiVA value-added:
  the trustworthy backbone, self-hosted, refreshed once a year (Jan/Feb when
  BACI publishes).
- **Monthly freshness layer (live)** — any pair involving an EU reporter gets
  the last 24 months of reported trade from **Eurostat Comext**, fetched live
  at click time (cached 6 h, no API key), shown in EUR next to the annual
  baseline. E.g. Lithuania → Russia monthly values through August 2026.
  If neither side reports monthly to Eurostat, the card is simply hidden.

## Deployment — narunas.io (GitHub Pages)

The site is fully static: pair data is precomputed into gzipped per-country
JSON files (`web/public/data/pairs/{ISO3}.json.gz`, ~27 MB for all 233
countries), and the monthly freshness layer calls Eurostat Comext **directly
from the browser** (Eurostat sends `Access-Control-Allow-Origin: *`).

- `.github/workflows/deploy.yml` builds `web/` with npm and publishes
  `web/dist` to GitHub Pages on every push to `main`.
- `web/public/CNAME` claims the custom domain `narunas.io` (DNS already
  points to GitHub Pages).
- To refresh the data: re-run the pipeline locally, then
  `python3 scripts/export_static.py` and commit the updated
  `web/public/data/` files.
- No credentials anywhere: all data sources are free, keyless, and public.

## Caveats

- Goods values are reconciled FOB; world totals land ~5% below headline WTO
  figures (expected: BACI removes CIF duplication).
- Russia's own reporting gaps post-2022 are filled by partner-reported
  (mirror) data in BACI.
- Services indirect routing is not estimated (no product-level routing data
  for services); use the TiVA section for the value-added view.
