import { describe, expect, it } from "vitest";
import { fmtUSD } from "./format";

describe("fmtUSD", () => {
  it("formats millions", () => {
    expect(fmtUSD(688)).toBe("$688M");
    expect(fmtUSD(1.4)).toBe("$1.4M");
  });
  it("formats billions", () => {
    expect(fmtUSD(157256)).toBe("$157B");
    expect(fmtUSD(1234)).toBe("$1.2B");
  });
  it("formats trillions", () => {
    expect(fmtUSD(22890000)).toBe("$22.9T");
  });
  it("formats small values as thousands", () => {
    expect(fmtUSD(0.4)).toBe("$400K");
  });
  it("handles zero", () => {
    expect(fmtUSD(0)).toBe("$0");
  });
});
