import { describe, expect, it } from "vitest";
import { colorOf, statusKeyFromLabel } from "@/lib/driverSchedule";

describe("schedule status helpers", () => {
  it("builds stable keys from customer names", () => {
    expect(statusKeyFromLabel("Bochum bringt´s")).toBe("bochum_bringt_s");
    expect(statusKeyFromLabel("Nicht verfügbar")).toBe("nicht_verfuegbar");
  });
  it("falls back to a known color for unknown values", () => {
    expect(colorOf("unbekannt")).toBe(colorOf("grau"));
  });
  it("uses a strong blue and offers brown", () => {
    expect(colorOf("blau")).toMatchObject({ bg: "#2385e7", fg: "#fff" });
    expect(colorOf("braun")).toMatchObject({ bg: "#784631", fg: "#fff" });
    expect(colorOf("blau").cls).toContain("bg-schedule-blue");
    expect(colorOf("braun").cls).toContain("bg-schedule-brown");
  });
});
