import { useMemo, useState } from "react";
import { searchProducts, type SearchHit } from "./productSearch";

/**
 * Typo-tolerant product finder input with a suggestion dropdown.
 * Shared by the hero (product-first entry) and the pair's product
 * intelligence card.
 */
export default function ProductSearchInput({
  placeholder,
  onPick,
  ariaLabel,
}: {
  placeholder: string;
  onPick: (hit: SearchHit) => void;
  ariaLabel?: string;
}) {
  const [query, setQuery] = useState("");

  const suggestions = useMemo(
    () => (query.trim().length >= 2 ? searchProducts(query) : []),
    [query],
  );

  const open = query.trim().length >= 2 && suggestions.length > 0;

  return (
    <div className="pr-searchwrap">
      <input
        className="pr-search"
        type="text"
        value={query}
        placeholder={placeholder}
        aria-label={ariaLabel ?? "find a product"}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && suggestions.length > 0) {
            onPick(suggestions[0]);
            setQuery(suggestions[0].name);
          }
          if (e.key === "Escape") {
            setQuery("");
          }
        }}
      />
      {open && (
        <ul className="pr-suggest">
          {suggestions.map((s) => (
            <li
              key={`${s.kind}-${s.code}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(s);
                setQuery(s.name);
              }}
            >
              <span className={`pr-kind ${s.kind}`}>
                {s.kind === "chapter" ? "CH" : s.kind === "heading" ? "HS4" : "HS6"}
              </span>
              <span className="pr-hitname">{s.name}</span>
              <span className="pr-hitcode">{s.code}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
