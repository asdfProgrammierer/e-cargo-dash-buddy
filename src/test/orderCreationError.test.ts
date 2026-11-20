import { describe, expect, it } from "vitest";
import { orderCreationError } from "@/lib/orderCreationError";

describe("order creation configuration failures", () => {
  it("identifies the missing merchant code instead of a generic save failure", () => {
    expect(orderCreationError({ message: "Für diesen Händler ist kein Händlercode hinterlegt" }, "generic"))
      .toContain("fehlt der Händlercode");
  });
  it("does not expose unrelated database details", () => {
    expect(orderCreationError({ message: "internal SQL detail" }, "Import fehlgeschlagen"))
      .toBe("Import fehlgeschlagen");
  });
});