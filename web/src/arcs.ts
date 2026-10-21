export interface Pt {
  x: number;
  y: number;
}

/**
 * Quadratic-bezier arc between two projected points, bowed to one side.
 * curvature > 0 bows left of the a->b direction, < 0 bows right.
 */
export function arcPath(a: Pt, b: Pt, curvature = 0.35): string {
  const { cx, cy } = arcControl(a, b, curvature);
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(
    1,
  )} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

/** Point at the middle (t = 0.5) of the arc — for label placement. */
export function arcMid(a: Pt, b: Pt, curvature = 0.35): Pt {
  const { cx, cy } = arcControl(a, b, curvature);
  // quadratic bezier at t = 0.5: 0.25*P0 + 0.5*C + 0.25*P1
  return {
    x: 0.25 * a.x + 0.5 * cx + 0.25 * b.x,
    y: 0.25 * a.y + 0.5 * cy + 0.25 * b.y,
  };
}

function arcControl(a: Pt, b: Pt, curvature: number): { cx: number; cy: number } {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // unit perpendicular
  const px = -dy / len;
  const py = dx / len;
  return { cx: mx + px * len * curvature, cy: my + py * len * curvature };
}

/** Line thickness proportional to sqrt of value (perceived magnitude). */
export function arcWidth(value: number, maxValue: number, min = 1, max = 7): number {
  if (maxValue <= 0 || value <= 0) return min;
  const t = Math.sqrt(value / maxValue);
  return min + t * (max - min);
}
