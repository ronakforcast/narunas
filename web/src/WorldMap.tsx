import { useEffect, useMemo, useRef, useState } from "react";
import {
  geoOrthographic,
  geoPath,
  geoGraticule10,
  geoCentroid,
  geoInterpolate,
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

const W = 960;
const H = 960;

export interface WorldMapProps {
  known: Set<string>;
  names: Map<string, string>;
  selA: string | null;
  selB: string | null;
  pairData: PairData | null;
  onPick: (iso3: string) => void;
  /** draw the trade arcs on the globe when a pair is loaded */
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

/** Great-circle path between two lon/lat points, projected on the globe. */
function greatCircle(
  a: [number, number],
  b: [number, number],
  proj: (p: [number, number]) => { x: number; y: number },
): string {
  const interp = geoInterpolate(a, b);
  const coords: [number, number][] = [];
  for (let i = 0; i <= 36; i++) coords.push(interp(i / 36));
  const px = coords.map((c) => proj(c));
  return (
    "M " +
    px
      .map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" L ")
  );
}

export default function WorldMap(props: WorldMapProps) {
  const {
    known,
    names,
    selA,
    selB,
    pairData,
    onPick,
    showArcs = false,
    direction = "ab",
  } = props;
  const [hover, setHover] = useState<string | null>(null);
  const [rotation, setRotation] = useState<[number, number]>([-15, -25]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zbRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const dragRef = useRef<{ x: number; y: number; moved: number } | null>(null);
  const [t, setT] = useState<ZoomTransform>(zoomIdentity);

  // wheel zooms; dragging rotates the globe instead
  useEffect(() => {
    const svg = select(svgRef.current!);
    const zb = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .filter((event: any) => event.type === "wheel")
      .on("zoom", (e) => {
        setT(e.transform);
      });
    zbRef.current = zb;
    svg.call(zb as never);
    return () => {
      svg.on(".zoom", null);
    };
  }, []);

  // rotation-stable centroid map (lon/lat per known country)
  const cent = useMemo(() => {
    const topo = worldTopo as unknown as any;
    const fc = feature(topo, topo.objects.countries) as unknown as any;
    const ids = countryIds as Record<string, string>;
    const m = new Map<string, [number, number]>();
    for (const f of fc.features) {
      const iso3 = ids[String(f.id)];
      if (iso3 && known.has(iso3)) {
        m.set(iso3, geoCentroid(f) as [number, number]);
      }
    }
    return m;
  }, [known]);

  // auto-focus: rotate so the selection faces the viewer
  useEffect(() => {
    let target: [number, number] | null = null;
    if (selA && selB) {
      const a = cent.get(selA);
      const b = cent.get(selB);
      if (a && b) target = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    } else if (selA) {
      target = cent.get(selA) ?? null;
    }
    if (target) {
      setRotation([
        -target[0],
        -Math.max(-60, Math.min(60, target[1])),
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selA, selB]);

  const { features, projection } = useMemo(() => {
    const topo = worldTopo as unknown as any;
    const fc = feature(topo, topo.objects.countries) as unknown as any;
    const ids = countryIds as Record<string, string>;
    const projection = geoOrthographic()
      .translate([W / 2, H / 2])
      .scale(W / 2 - 10)
      .rotate([rotation[0], rotation[1]])
      .clipAngle(90)
      .precision(0.5);
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
  }, [known, rotation]);

  const graticule = useMemo(
    () => geoPath(projection!)(geoGraticule10()) ?? "",
    [projection],
  );
  const sphere = useMemo(
    () => geoPath(projection!)({ type: "Sphere" } as any) ?? "",
    [projection],
  );

  const proj = (ll: [number, number]) => {
    const p = projection!(ll);
    return p ? { x: p[0], y: p[1] } : { x: 0, y: 0 };
  };

  function resetView() {
    if (zbRef.current) {
      select(svgRef.current!).call(zbRef.current.transform, zoomIdentity);
    }
  }

  // ---- trade arcs: thin great circles on the globe ----
  const arcs = useMemo(() => {
    if (!showArcs || !pairData) return null;
    const fwd = direction !== "ba";
    const fromIso = fwd ? pairData.from : pairData.to;
    const toIso = fwd ? pairData.to : pairData.from;
    const aC = cent.get(fromIso);
    const bC = cent.get(toIso);
    if (!aC || !bC) return null;
    const latest = pairData.goods.years.length - 1;
    const directVal =
      (fwd
        ? pairData.goods.from_to[latest]
        : pairData.goods.to_from[latest]) ?? 0;
    const ims = (
      fwd ? pairData.indirect.from_to : pairData.indirect.to_from
    ).slice(0, 3);
    const maxVal = Math.max(
      directVal,
      ...ims.map((x) => x.estimate_musd),
      1,
    );
    const legs: { d: string; w: number; direct: boolean }[] = [];
    if (directVal > 0) {
      legs.push({
        d: greatCircle(aC, bC, proj),
        w: 1.4 + (directVal / maxVal) * 1.6,
        direct: true,
      });
    }
    ims.forEach((im) => {
      const cC = cent.get(im.intermediary);
      if (!cC) return;
      const share = im.estimate_musd / maxVal;
      const w = 0.8 + share * 0.9;
      legs.push({ d: greatCircle(aC, cC, proj), w, direct: false });
      legs.push({ d: greatCircle(cC, bC, proj), w, direct: false });
    });
    return { from: proj(aC), to: proj(bC), legs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArcs, pairData, direction, cent, projection]);

  const k = Math.sqrt(t.k);
  const dragMoved = () => (dragRef.current?.moved ?? 0) > 6;

  return (
    <div className="map-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="map"
        onPointerDown={(e) => {
          dragRef.current = {
            x: e.clientX,
            y: e.clientY,
            moved: 0,
          };
        }}
        onPointerMove={(e) => {
          const d = dragRef.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          d.moved += Math.abs(dx) + Math.abs(dy);
          d.x = e.clientX;
          d.y = e.clientY;
          if (d.moved > 3) {
            setRotation((r) => [
              r[0] + dx * 0.28,
              Math.max(-80, Math.min(80, r[1] - dy * 0.28)),
            ]);
          }
        }}
        onPointerUp={() => {
          /* keep moved for the click check */
        }}
        onPointerLeave={() => {
          dragRef.current = null;
        }}
      >
        <defs>
          <radialGradient id="globe-shade" cx="36%" cy="30%" r="85%">
            <stop offset="0%" stopColor="#1a2a44" />
            <stop offset="55%" stopColor="#0e1726" />
            <stop offset="100%" stopColor="#070b13" />
          </radialGradient>
        </defs>
        <g transform={t.toString()}>
          <path
            d={sphere}
            fill="url(#globe-shade)"
            stroke="rgba(79, 195, 247, 0.35)"
            strokeWidth={1}
          />
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
                onClick={
                  f.iso3 && !dragMoved() ? () => onPick(f.iso3!) : undefined
                }
                onMouseEnter={f.iso3 ? () => setHover(f.iso3) : undefined}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}

          {/* thin great-circle trade arcs on the globe */}
          {arcs && (
            <g className="arcs" pointerEvents="none">
              {arcs.legs.map((l, i) => (
                <path
                  key={i}
                  d={l.d}
                  fill="none"
                  className={
                    l.direct ? "trade-arc direct" : "trade-arc via"
                  }
                  strokeWidth={l.w / k}
                />
              ))}
              <circle
                cx={arcs.from.x}
                cy={arcs.from.y}
                r={4 / k}
                className="node-dot node-a"
              />
              <circle
                cx={arcs.to.x}
                cy={arcs.to.y}
                r={4 / k}
                className="node-dot node-b"
              />
              <circle
                cx={arcs.from.x}
                cy={arcs.from.y}
                r={4 / k}
                className="node-pulse pulse-a"
              />
              <circle
                cx={arcs.to.x}
                cy={arcs.to.y}
                r={4 / k}
                className="node-pulse pulse-b"
              />
            </g>
          )}

          {/* numbered badges for A and B — counter-scaled to stay readable */}
          {selA && cent.get(selA) && proj(cent.get(selA)!).x > 0 && (
            <Badge p={proj(cent.get(selA)!)} n={1} color={COLOR_A} k={t.k} />
          )}
          {selB && cent.get(selB) && proj(cent.get(selB)!).x > 0 && (
            <Badge p={proj(cent.get(selB)!)} n={2} color={COLOR_B} k={t.k} />
          )}
        </g>
      </svg>
      <button
        className="reset-view"
        onClick={resetView}
        title="reset zoom"
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
          <IconZoom width={12} height={12} /> drag to rotate · scroll to zoom ·
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
