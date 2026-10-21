import { useMemo } from "react";
import {
  sankey,
  sankeyLinkHorizontal,
  type SankeyGraph,
  type SankeyNode,
  type SankeyLink,
} from "d3-sankey";
import type { PairData } from "./types";
import { fmtUSD } from "./format";

export interface FlowChartProps {
  pairData: PairData;
  /** which direction to draw: "ab" = from→to, "ba" = to→from */
  direction: "ab" | "ba";
  names: Map<string, string>;
  flags: Map<string, string>; // iso3 -> iso2 (for flag emoji)
}

const COLOR_A = "#ff8c00"; // amber — country A / direct A→B
const COLOR_B = "#00e5ff"; // ice cyan — country B
// glacier ramp per intermediary — cool blues flowing toward B's cyan
const IM_COLORS = [
  "#6b7fd7",
  "#5f92e0",
  "#55aee6",
  "#4fc3f7",
  "#49cfe0",
  "#5ad6bd",
  "#7eddc2",
  "#a8e3cd",
];
const imColor = (i: number) => IM_COLORS[i % IM_COLORS.length];

const W = 940;
const H = 560;
const MARGIN = { top: 56, right: 120, bottom: 16, left: 120 };
const TOP_N = 8;

function flagEmoji(iso2: string | null): string {
  if (!iso2 || iso2.length !== 2) return "🏳️";
  return String.fromCodePoint(
    ...iso2
      .toUpperCase()
      .split("")
      .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

interface Nodal {
  id: string;
}
interface Linkal {
  source: string;
  target: string;
  value: number;
  kind: "leg1" | "leg2" | "direct";
  via?: string;
  products?: { hs4: string; value_musd: number }[];
}

export default function FlowChart({
  pairData,
  direction,
  names,
  flags,
}: FlowChartProps) {
  const from = direction === "ab" ? pairData.from : pairData.to;
  const to = direction === "ab" ? pairData.to : pairData.from;
  const nameOf = (iso: string) => names.get(iso) ?? iso;

  const layout = useMemo(() => {
    const inter =
      direction === "ab"
        ? pairData.indirect.from_to
        : pairData.indirect.to_from;
    const latest = pairData.goods.years.length - 1;
    const direct =
      direction === "ab"
        ? pairData.goods.from_to[latest] ?? 0
        : pairData.goods.to_from[latest] ?? 0;

    const kept = inter.filter((x) => x.estimate_musd > 0).slice(0, TOP_N);
    const colorOf = new Map(kept.map((x, i) => [x.intermediary, imColor(i)]));

    const nodes: Nodal[] = [{ id: from }, ...kept.map((x) => ({ id: x.intermediary })), { id: to }];
    const links: Linkal[] = [];
    for (const im of kept) {
      links.push({
        source: from,
        target: im.intermediary,
        value: im.estimate_musd,
        kind: "leg1",
        via: im.intermediary,
        products: im.top_products,
      });
      links.push({
        source: im.intermediary,
        target: to,
        value: im.estimate_musd,
        kind: "leg2",
        via: im.intermediary,
        products: im.top_products,
      });
    }
    if (direct > 0) {
      links.push({ source: from, target: to, value: direct, kind: "direct" });
    }
    if (links.length === 0) return null;

    const sk = sankey<Nodal, Linkal>()
      .nodeId((d) => d.id)
      .nodeWidth(12)
      .nodePadding(14)
      .extent([
        [MARGIN.left, MARGIN.top],
        [W - MARGIN.right, H - MARGIN.bottom],
      ]);

    const graph = sk({
      nodes: nodes.map((d) => ({ ...d })),
      links: links.map((d) => ({ ...d })),
    });
    return { graph, kept, direct, colorOf };
  }, [pairData, direction, from, to]);

  const pathGen = sankeyLinkHorizontal<Nodal, Linkal>();

  const colorOfNode = (id: string): string =>
    id === from
      ? COLOR_A
      : id === to
        ? COLOR_B
        : (colorOf.get(id) ?? "#8a97a8");

  const latest = pairData.goods.years.length - 1;
  const directVal =
    direction === "ab"
      ? pairData.goods.from_to[latest] ?? 0
      : pairData.goods.to_from[latest] ?? 0;
  const indirectTotal =
    (direction === "ab"
      ? pairData.indirect.from_to
      : pairData.indirect.to_from
    ).reduce((s, x) => s + x.estimate_musd, 0);

  if (!layout) {
    return (
      <div className="flow-empty">
        no trade flows recorded between {nameOf(from)} and {nameOf(to)}
      </div>
    );
  }

  const { graph } = layout;
  const { colorOf } = layout;
  const nodeById = new Map<string, SankeyNode<Nodal, Linkal>>(
    graph.nodes.map((n) => [n.id, n]),
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="flowchart">
      <defs>
        {graph.links.map((l, i) => {
          const s = l.source as SankeyNode<Nodal, Linkal>;
          const t = l.target as SankeyNode<Nodal, Linkal>;
          return (
            <linearGradient
              key={`g-${i}`}
              id={`fg-${i}`}
              gradientUnits="userSpaceOnUse"
              x1={s.x1 ?? 0}
              y1={0}
              x2={t.x0 ?? 0}
              y2={0}
            >
              <stop offset="0%" stopColor={colorOfNode(s.id)} />
              <stop offset="100%" stopColor={colorOfNode(t.id)} />
            </linearGradient>
          );
        })}
      </defs>
      <text x={W / 2} y={26} textAnchor="middle" className="flow-title">
        How {nameOf(from)}'s goods reach {nameOf(to)}
      </text>
      <text x={W / 2} y={44} textAnchor="middle" className="flow-sub">
        {pairData.indirect.year} · wider ribbon, more money · the amber band is
        direct trade
      </text>

      {/* ribbons — filled bands, gradient from source colour to target */}
      {graph.links.map((l, i) => {
        const d = pathGen(l);
        if (!d) return null;
        const title =
          l.kind === "direct"
            ? `direct: ${fmtUSD(l.value)}`
            : `via ${nameOf(l.via!)}: ${fmtUSD(l.value)}${
                l.products?.length
                  ? " · " +
                    l.products
                      .slice(0, 3)
                      .map((p) => `HS ${p.hs4}`)
                      .join(", ")
                  : ""
              }`;
        return (
          <path
            key={`l-${i}`}
            d={d}
            fill={`url(#fg-${i})`}
            className={
              l.kind === "direct" ? "flow-link direct" : "flow-link"
            }
          >
            <title>{title}</title>
          </path>
        );
      })}

      {/* nodes */}
      {graph.nodes.map((n) => {
        const isA = n.id === from;
        const isB = n.id === to;
        const color = isA ? COLOR_A : isB ? COLOR_B : (colorOf.get(n.id) ?? "#888");
        const node = nodeById.get(n.id)!;
        if (
          node.x0 == null || node.x1 == null ||
          node.y0 == null || node.y1 == null
        ) {
          return null;
        }
        return (
          <g key={n.id}>
            <rect
              x={node.x0}
              y={node.y0}
              width={node.x1 - node.x0}
              height={Math.max(node.y1 - node.y0, 2)}
              rx={2}
              fill={color}
              opacity={isA || isB ? 1 : 0.9}
              stroke="#0a0e17"
              strokeWidth={0.75}
            />
            {isA && (
              <>
                <text
                  x={node.x0 - 10}
                  y={(node.y0 + node.y1) / 2}
                  textAnchor="end"
                  className="flow-node-label hero"
                  fill={COLOR_A}
                >
                  {flagEmoji(flags.get(from) ?? null)} {nameOf(from)}
                </text>
                <text
                  x={node.x0 - 10}
                  y={(node.y0 + node.y1) / 2 + 17}
                  textAnchor="end"
                  className="flow-node-value hero"
                  fill={COLOR_A}
                >
                  {fmtUSD(directVal)} direct →
                </text>
              </>
            )}
            {isB && (
              <>
                <text
                  x={node.x1 + 10}
                  y={(node.y0 + node.y1) / 2}
                  className="flow-node-label hero"
                  fill={COLOR_B}
                >
                  {flagEmoji(flags.get(to) ?? null)} {nameOf(to)}
                </text>
                <text
                  x={node.x1 + 10}
                  y={(node.y0 + node.y1) / 2 + 17}
                  className="flow-node-value hero"
                  fill={COLOR_B}
                >
                  ← {fmtUSD(indirectTotal)} via others (est.)
                </text>
              </>
            )}
            {!isA && !isB && (
              <>
                <text
                  x={node.x1 + 8}
                  y={(node.y0 + node.y1) / 2 - 1}
                  className="flow-node-label"
                >
                  {nameOf(n.id)}
                </text>
                <text
                  x={node.x1 + 8}
                  y={(node.y0 + node.y1) / 2 + 13}
                  className="flow-node-value"
                  fill={color}
                >
                  {fmtUSD(n.value ?? 0)}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
