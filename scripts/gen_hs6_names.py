#!/usr/bin/env python3
"""Generate web/src/assets/hs6-names.json — the searchable product index.

Contents:
  hs6:      5,202 HS6 code -> official BACI description
  hs4:      derived heading names (shortest HS6 child, text before ':' or '(')
  chapters: WCO chapter titles (01-97, official wording)

Reads only the extracted BACI metadata CSV — no DB dependency, so it can
run while trade.db is being rebuilt.
"""
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRODUCTS_CSV = ROOT / "data" / "extracted" / "product_codes_HS12_V202601.csv"
OUT = ROOT / "web" / "src" / "assets" / "hs6-names.json"

# WCO Harmonized System chapter titles (HS 2022 edition wording).
CHAPTERS = {
    "01": "Live animals",
    "02": "Meat and edible meat offal",
    "03": "Fish, crustaceans, molluscs, aquatic invertebrates",
    "04": "Dairy produce, birds' eggs, honey",
    "05": "Products of animal origin, nes",
    "06": "Live trees, plants, cut flowers",
    "07": "Edible vegetables and roots",
    "08": "Edible fruit and nuts",
    "09": "Coffee, tea, spices",
    "10": "Cereals",
    "11": "Milling industry products, starches, wheat gluten",
    "12": "Oil seeds, industrial or medicinal plants, straw and fodder",
    "13": "Lac, gums, resins, vegetable saps and extracts",
    "14": "Vegetable plaiting materials, nes",
    "15": "Animal, vegetable or microbial fats and oils",
    "16": "Preparations of meat, fish, or insects",
    "17": "Sugars and sugar confectionery",
    "18": "Cocoa and cocoa preparations",
    "19": "Preparations of cereals, flour, starch or milk",
    "20": "Preparations of vegetables, fruit or nuts",
    "21": "Miscellaneous edible preparations",
    "22": "Beverages, spirits and vinegar",
    "23": "Food industry residues, animal fodder",
    "24": "Tobacco and nicotine inhalation products",
    "25": "Salt, sulphur, earths and stone, plaster, cement",
    "26": "Ores, slag and ash",
    "27": "Mineral fuels, mineral oils, bituminous substances",
    "28": "Inorganic chemicals, precious and rare-earth compounds",
    "29": "Organic chemicals",
    "30": "Pharmaceutical products",
    "31": "Fertilisers",
    "32": "Dyes, pigments, paints, varnishes, putty, inks",
    "33": "Essential oils, perfumery, cosmetic preparations",
    "34": "Soap, washing and lubricating preparations, waxes, candles",
    "35": "Albuminoidal substances, modified starches, glues, enzymes",
    "36": "Explosives, pyrotechnic products, matches",
    "37": "Photographic or cinematographic goods",
    "38": "Miscellaneous chemical products",
    "39": "Plastics and articles thereof",
    "40": "Rubber and articles thereof",
    "41": "Raw hides and skins and leather",
    "42": "Articles of leather, travel goods, handbags",
    "43": "Furskins and artificial fur",
    "44": "Wood and articles of wood, wood charcoal",
    "45": "Cork and articles of cork",
    "46": "Straw and plaiting materials, basketware",
    "47": "Wood pulp, recovered paper or paperboard",
    "48": "Paper and paperboard, articles thereof",
    "49": "Printed books, newspapers, printed matter",
    "50": "Silk",
    "51": "Wool and animal hair",
    "52": "Cotton",
    "53": "Other vegetable textile fibres",
    "54": "Man-made filaments",
    "55": "Man-made staple fibres",
    "56": "Wadding, felt, nonwovens, yarn, twine, ropes",
    "57": "Carpets and textile floor coverings",
    "58": "Special woven fabrics, lace, tapestries, embroidery",
    "59": "Impregnated or coated textile fabrics",
    "60": "Knitted or crocheted fabrics",
    "61": "Knitted or crocheted apparel",
    "62": "Apparel, not knitted or crocheted",
    "63": "Other made-up textile articles",
    "64": "Footwear",
    "65": "Headgear",
    "66": "Umbrellas, walking sticks, whips",
    "67": "Feather and down articles, artificial flowers",
    "68": "Articles of stone, plaster, cement, mica",
    "69": "Ceramic products",
    "70": "Glass and glassware",
    "71": "Pearls, precious stones, precious metals, jewellery, coin",
    "72": "Iron and steel",
    "73": "Articles of iron or steel",
    "74": "Copper and articles thereof",
    "75": "Nickel and articles thereof",
    "76": "Aluminium and articles thereof",
    "78": "Lead and articles thereof",
    "79": "Zinc and articles thereof",
    "80": "Tin and articles thereof",
    "81": "Other base metals, cermets",
    "82": "Tools, implements, cutlery of base metal",
    "83": "Miscellaneous articles of base metal",
    "84": "Nuclear reactors, boilers, machinery",
    "85": "Electrical machinery and equipment",
    "86": "Railway locomotives, rolling stock, track",
    "87": "Vehicles other than railway",
    "88": "Aircraft, spacecraft",
    "89": "Ships, boats, floating structures",
    "90": "Optical, measuring, medical instruments",
    "91": "Clocks and watches",
    "92": "Musical instruments",
    "93": "Arms and ammunition",
    "94": "Furniture, bedding, lighting, prefabricated buildings",
    "95": "Toys, games and sports requisites",
    "96": "Miscellaneous manufactured articles",
    "97": "Works of art, collectors' pieces, antiques",
    "99": "Commodities not specified by kind",
}


def clean_heading(desc: str) -> str:
    """Heading-level concept: text before ':' or '(', trimmed."""
    for sep in (":", "("):
        idx = desc.find(sep)
        if idx > 3:
            desc = desc[:idx]
    return desc.strip().rstrip(",").strip()


def main() -> None:
    hs6: dict[str, str] = {}
    headings: dict[str, str] = {}
    with open(PRODUCTS_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            code = row["code"].strip()
            desc = row["description"].strip()
            if not code or not desc:
                continue
            hs6[code] = desc
            h4 = code[:4]
            # prefer a child whose description is the heading's main concept
            # (not a "Parts of ..." residual); among those, the shortest
            # child is the most generic phrasing of the heading
            is_parts = desc.lower().startswith("parts of")
            if h4 not in headings:
                headings[h4] = desc
            elif not is_parts and headings[h4].lower().startswith("parts of"):
                headings[h4] = desc
            elif (
                is_parts == headings[h4].lower().startswith("parts of")
                and len(desc) < len(headings[h4])
            ):
                headings[h4] = desc

    # verify every chapter present in the codes has a title
    chapters_in_data = {code[:2] for code in hs6}
    missing = chapters_in_data - set(CHAPTERS)
    if missing:
        raise SystemExit(f"missing chapter titles for: {sorted(missing)}")

    # derive readable heading names (truncate the chosen child)
    hs4 = {h4: clean_heading(d)[:60] for h4, d in headings.items()}

    doc = {
        "hs6": hs6,
        "hs4": hs4,
        "chapters": CHAPTERS,
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=0))
    kb = OUT.stat().st_size / 1024
    print(
        f"hs6={len(hs6)} hs4={len(hs4)} chapters={len(CHAPTERS)} "
        f"-> {OUT} ({kb:.0f} KB)"
    )

    # quick sanity: known codes resolve to expected concepts
    assert hs6.get("300440", "").lower().startswith("medicament"), hs6.get("300440")
    assert re.match(r"^live animals$", CHAPTERS["01"], re.I)
    assert hs4.get("8542", "").lower().startswith("electronic int"), hs4.get("8542")


if __name__ == "__main__":
    main()
