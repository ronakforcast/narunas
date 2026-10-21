import { useEffect, useState } from "react";
import { fetchTradeNews, type NewsArticle } from "./api";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** GDELT timestamps look like 20261020T010000Z. */
function fmtDate(s: string | null): string {
  if (!s || s.length < 8) return "";
  const m = parseInt(s.slice(4, 6), 10);
  const d = parseInt(s.slice(6, 8), 10);
  return `${MONTHS[m - 1] ?? ""} ${d || ""}`.trim();
}

export default function NewsCard({
  nameA,
  nameB,
}: {
  nameA: string;
  nameB: string;
}) {
  const [items, setItems] = useState<NewsArticle[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchTradeNews(nameA, nameB).then((r) => {
      if (alive) {
        setItems(r);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [nameA, nameB]);

  return (
    <section className="card news-card">
      <h3>
        Trade in the news{" "}
        <span className="year">GDELT · global media scan</span>
      </h3>
      {loading ? (
        <p className="hint">scanning news feeds…</p>
      ) : !items || items.length === 0 ? (
        <p className="hint">
          no recent trade news found for {nameA} or {nameB}
        </p>
      ) : (
        <ol className="news-list">
          {items.map((a, i) => (
            <li key={a.url + i}>
              <span className="news-meta">
                {fmtDate(a.seen)}
                {a.domain ? ` · ${a.domain}` : ""}
              </span>
              <a
                className="news-title"
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {a.title}
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
