import { describe, expect, it } from "vitest";
import { arcPath, arcMid, arcWidth } from "./arcs";

describe("arcPath", () => {
  it("starts and ends at the given points", () => {
    const d = arcPath({ x: 10, y: 20 }, { x: 110, y: 60 });
    expect(d.startsWith("M 10.0 20.0")).toBe(true);
    expect(d.endsWith("110.0 60.0")).toBe(true);
    expect(d).toMatch(/^M [-\d.]+ [-\d.]+ Q [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+$/);
  });
  it("positive and negative curvature bow to opposite sides", () => {
    const up = arcPath({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.5);
    const down = arcPath({ x: 0, y: 0 }, { x: 100, y: 0 }, -0.5);
    expect(up).not.toBe(down);
  });
});

describe("arcMid", () => {
  it("is the midpoint for zero curvature", () => {
    const m = arcMid({ x: 0, y: 0 }, { x: 100, y: 40 }, 0);
    expect(m.x).toBeCloseTo(50);
    expect(m.y).toBeCloseTo(20);
  });
  it("moves off the line for nonzero curvature", () => {
    const m = arcMid({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.5);
    expect(m.x).toBeCloseTo(50);
    expect(m.y).toBeCloseTo(25);
  });
});

describe("arcWidth", () => {
  it("scales with sqrt of value", () => {
    expect(arcWidth(0, 100)).toBe(1);
    expect(arcWidth(100, 100)).toBe(7);
    expect(arcWidth(25, 100)).toBeCloseTo(4);
  });
  it("handles zero max", () => {
    expect(arcWidth(5, 0)).toBe(1);
  });
});
