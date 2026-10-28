import { useRef, useState } from "react";
import type { Country } from "./types";
import { IconClose } from "./icons";

function flagOf(iso2: string | null): string {
  if (!iso2 || iso2.length !== 2) return "";
  return String.fromCodePoint(
    ...iso2
      .toUpperCase()
      .split("")
      .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

/** One of the two country inputs (slot A or slot B). */
export default function CountrySlot({
  accent,
  placeholder,
  countries,
  selected,
  onPick,
  onClear,
}: {
  accent: "a" | "b";
  placeholder: string;
  countries: Country[];
  selected: Country | null;
  onPick: (iso3: string) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement | null>(null);

  const needle = q.trim().toLowerCase();
  // rank: exact ISO3 match first ("IND" -> India, not "Br. Indian Ocean
  // Terr."), then names starting with the query, then names containing it
  const rankOf = (c: Country): number => {
    const name = c.name.toLowerCase();
    if (c.iso3.toLowerCase() === needle) return 0;
    if (name.startsWith(needle)) return 1;
    if (name.includes(needle)) return 2;
    return 3;
  };
  const matches =
    needle.length < 1
      ? []
      : countries
          .filter(
            (c) =>
              c.name.toLowerCase().includes(needle) ||
              c.iso3.toLowerCase() === needle,
          )
          .sort((a, b) => rankOf(a) - rankOf(b) || a.name.localeCompare(b.name))
          .slice(0, 8);

  function choose(c: Country) {
    onPick(c.iso3);
    setQ("");
    setOpen(false);
    ref.current?.blur();
  }

  const display = q.length > 0 ? q : selected ? selected.name : "";

  return (
    <div className={`chip-slot ${selected ? `filled ${accent}` : ""}`}>
      <input
        ref={ref}
        value={display}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        aria-label={`country ${accent.toUpperCase()}`}
        onFocus={(e) => {
          setOpen(true);
          e.target.select();
        }}
        onChange={(e) => {
          setQ(e.target.value);
          setHi(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (matches[hi]) choose(matches[hi]);
          } else if (e.key === "Escape") {
            setQ("");
            setOpen(false);
            ref.current?.blur();
          }
        }}
        onBlur={() => {
          setOpen(false);
          setQ("");
        }}
      />
      {selected && (
        <button
          className="slot-x"
          aria-label={`remove ${selected.name}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onClear();
            ref.current?.focus();
          }}
        >
          <IconClose width={12} height={12} />
        </button>
      )}
      {open && matches.length > 0 && (
        <ul className="results">
          {matches.map((c, i) => (
            <li
              key={c.iso3}
              className={i === hi ? "hi" : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHi(i)}
              onClick={() => choose(c)}
            >
              <span className="c-name">
                <span className="c-flag">{flagOf(c.iso2)}</span> {c.name}
              </span>
              <span className="iso">{c.iso3}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
