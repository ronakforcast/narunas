import { useEffect, useMemo, useRef, useState } from "react";
import {
  geoNaturalEarth1,
  geoPath,
  geoGraticule10,
  geoCentroid,
} from "d3-geo";
import { select } from "d3-selection";
import {
  zoom as d3zoom,
  zoomIdentity,
  type ZoomBehavior,
  type ZoomTransform,
} from "d3-zoom";
import { feature } from "topojson-client";
import worldTopo from "world-atlas/countries-110m.json";
import countryIds from "./assets/country-ids.json";
import type { PairData } from "./types";
import { IconHome, IconZoom } from "./icons";
import { arcPath, arcWidth } from "./arcs";

const W = 960;
const H = 500;

export interface WorldMapProps {
  known: Set<string>;
  names: Map<string, string>;
  selA: string | null;
  selB: string | null;
  pairData: PairData | null;
  onPick: (iso3: string) => void;
  /** draw the trade arcs on the stage when a pair is loaded */
  showArcs?: boolean;
  /** which direction the arcs follow (matches the hero tabs) */
  direction?: "ab" | "ba";
}

interface Feat {
  id: string;
  name: string;
  iso3: string | null;
  centroid: [number, number];
  d: string;
}

const COLOR_A = "#ff8c00"; // amber — country A
const COLOR_B = "#00e5ff"; // ice cyan — country B

export default function WorldMap(props: WorldMapProps) {
  const { known, names, selA, selB, pairData, onPick, showArcs = false, direction = "ab" } =
    props;
  const [hover, setHover] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zbRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [t, setT] = useState<ZoomTransform>(zoomIdentity);

  // attach zoom & pan
  useEffect(() => {
    const svg = select(svgRef.current!);
    const zb = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 15])
      .on("zoom", (e) => {
        setT(e.transform);
      });
    zbRef.current = zb;
    svg.call(zb as never);
    return () => {
      svg.on(".zoom", null);
    };
  }, []);

  // whenever a NEW selection starts, reset the view so both countries stay visible
  useEffect(() => {
    if (zbRef.current && !selB) {
      select(svgRef.current!).call(zbRef.current.transform, zoomIdentity);
    }
  }, [selA, selB]);

  function resetView() {
    if (zbRef.current) {
      select(svgRef.current!).call(zbRef.current.transform, zoomIdentity);
    }
  }

  const { features, projection } = useMemo(() => {
    const topo = worldTopo as unknown as any;
    const fc = feature(topo, topo.objects.countries) as unknown as any;
    const ids = countryIds as Record<string, string>;
    const projection = geoNaturalEarth1().fitExtent(
      [
        [8, 8],
        [W - 8, H - 8],
      ],
      { type: "Sphere" } as any,
    );
    const path = geoPath(projection);
    const features: Feat[] = fc.features
      .map((f: any) => {
        const iso3 = ids[String(f.id)] ?? null;
        return {
          id: String(f.id),
          name: f.properties?.name ?? iso3 ?? "?",
          iso3: iso3 && known.has(iso3) ? iso3 : null,
          centroid: geoCentroid(f) as [number, number],
          d: path(f) ?? "",
        };
      })
      .filter((f: Feat) => f.d);
    return { features, projection };
  }, [known]);

  const graticule = useMemo(
    () => geoPath(projection!)(geoGraticule10()) ?? "",
    [projection],
  );
  const sphere = useMemo(
    () => geoPath(projection!)({ type: "Sphere" } as any) ?? "",
    [projection],
  );

  const cent = useMemo(() => {
    const m = new Map<string, [number, number]>();
    for (const f of features) if (f.iso3) m.set(f.iso3, f.centroid);
    return m;
  }, [features]);

  const proj = (ll: [number, number]) => {
    const p = projection!(ll);
    return p ? { x: p[0], y: p[1] } : { x: 0, y: 0 };
  };

  return (
    <div className="map-wrap">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="map">
        <g transform={t.toString()}>
          <path d={sphere} className="ocean" />
          <path d={graticule} className="graticule" />
          {features.map((f, i) => {
            const isA = selA != null && f.iso3 === selA;
            const isB = selB != null && f.iso3 === selB;
            const isHover = f.iso3 && f.iso3 === hover;
            let cls = "country";
            if (f.iso3) cls += " clickable";
            if (isA) cls += " sel-a";
            else if (isB) cls += " sel-b";
            else if (isHover) cls += " hover";
            // NOTE: no <title> child — React 19's metadata hoisting shuffles
            // <title> elements across SVG paths, scrambling tooltips AND
            // sibling props. Hover name is shown in the legend instead.
            return (
              <path
                key={`${f.id}-${i}`}
                data-iso={f.iso3 ?? undefined}
                d={f.d}
                className={cls}
                onClick={f.iso3 ? () => onPick(f.iso3!) : undefined}
                onMouseEnter={f.iso3 ? () => setHover(f.iso3) : undefined}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}

          {/* trade arcs on the stage — direct leg plus top intermediaries */}
          {(() => {
            if (!showArcs || !pairData) return null;
            const fwd = direction !== "ba";
            const fromIso = fwd ? pairData.from : pairData.to;
            const toIso = fwd ? pairData.to : pairData.from;
            const aC = cent.get(fromIso);
            const bC = cent.get(toIso);
            if (!aC || !bC) return null;
            const from = proj(aC);
            const to = proj(bC);
            const latest = pairData.goods.years.length - 1;
            const directVal =
              (fwd
                ? pairData.goods.from_to[latest]
                : pairData.goods.to_from[latest]) ?? 0;
            const ims = (
              fwd ? pairData.indirect.from_to : pairData.indirect.to_from
            ).slice(0, 5);
            const maxVal = Math.max(
              directVal,
              ...ims.map((x) => x.estimate_musd),
              1,
            );
            const k = Math.sqrt(t.k);
            const legs: { d: string; w: number; direct: boolean }[] = [];
            if (directVal > 0) {
              legs.push({
                d: arcPath(from, to, 0.16),
                w: arcWidth(directVal, maxVal, 1.5, 6),
                direct: true,
              });
            }
            ims.forEach((im) => {
              const cC = cent.get(im.intermediary);
              if (!cC) return;
              const cp = proj(cC);
              const w = arcWidth(im.estimate_musd, maxVal, 1, 4.5);
              legs.push({ d: arcPath(from, cp, 0.3), w, direct: false });
              legs.push({ d: arcPath(cp, to, -0.28), w, direct: false });
            });
            return (
              <g className="arcs" pointerEvents="none">
                {legs.map((l, i) => (
                  <path
                    key={i}
                    d={l.d}
                    fill="none"
                    className={l.direct ? "trade-arc direct" : "trade-arc via"}
                    strokeWidth={l.w / k}
                  />
                ))}
                <circle
                  cx={from.x}
                  cy={from.y}
                  r={4 / k}
                  className="node-dot node-a"
                />
                <circle
                  cx={to.x}
                  cy={to.y}
                  r={4 / k}
                  className="node-dot node-b"
                />
                <circle
                  cx={from.x}
                  cy={from.y}
                  r={4 / k}
                  className="node-pulse pulse-a"
                />
                <circle
                  cx={to.x}
                  cy={to.y}
                  r={4 / k}
                  className="node-pulse pulse-b"
                />
              </g>
            );
          })()}

          {/* numbered badges for A and B — counter-scaled to stay readable */}
          {selA && cent.get(selA) && (
            <Badge p={proj(cent.get(selA)!)} n={1} color={COLOR_A} k={t.k} />
          )}
          {selB && cent.get(selB) && (
            <Badge p={proj(cent.get(selB)!)} n={2} color={COLOR_B} k={t.k} />
          )}
        </g>
      </svg>
      <button
        className="reset-view"
        onClick={resetView}
        title="reset zoom & pan"
        aria-label="reset map view"
        style={{ visibility: t.k > 1.01 ? "visible" : "hidden" }}
      >
        <IconHome />
      </button>
      <div className="map-legend">
        <span className="hover-name">
          {hover ? names.get(hover) ?? hover : ""}
        </span>
        <span className="lg zoom">
          <IconZoom width={12} height={12} /> scroll to zoom · drag to pan ·
          click a country
        </span>
      </div>
      {showArcs && (
        <div className="stage-legend">
          <span className="lg">
            <i className="sw sw-direct" /> direct trade
          </span>
          <span className="lg">
            <i className="sw sw-via" /> via intermediaries (est.)
          </span>
        </div>
      )}
    </div>
  );
}

function Badge({
  p,
  n,
  color,
  k,
}: {
  p: { x: number; y: number };
  n: number;
  color: string;
  k: number;
}) {
  const r = 9 / Math.sqrt(k);
  return (
    <g pointerEvents="none">
      <circle
        cx={p.x}
        cy={p.y - 14 / k}
        r={r}
        fill={color}
        stroke="#223349"
        strokeWidth={1.5 / k}
      />
      <text
        x={p.x}
        y={p.y - 14 / k + r * 0.36}
        textAnchor="middle"
        fontSize={11 / k}
        fontWeight={800}
        fill="#0e1726"
      >
        {n}
      </text>
    </g>
  );
}
