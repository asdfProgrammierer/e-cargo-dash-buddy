import { describe, expect, it } from "vitest";
import { deliveryPercent } from "@/lib/exclusiveTours";

describe("exclusive tour delivery progress", () => {
  it("counts 21 delivered stops of 25 as 84 percent, not merely completed stops", () => {
    expect(deliveryPercent({ stops: 25, delivered: 21 })).toBe(84);
  });
  it("reports no deliveries for an empty planned tour", () => {
    expect(deliveryPercent({ stops: 0, delivered: 0 })).toBe(0);
  });
});