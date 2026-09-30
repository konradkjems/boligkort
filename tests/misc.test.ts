import { describe, expect, it } from "vitest";
import { colorForValue, fillColorExpression, legendFor, NO_DATA_COLOR } from "../src/lib/colorize";
import { isStale } from "../src/lib/data/freshness";
import { parseBfe } from "../src/lib/format";
import { mapAdressevaelger } from "../src/server/datafordeler/search";

describe("farvelægning", () => {
  it.each(["aar", "anv", "vm2"] as const)("%s har stigende stop i step-udtrykket", (dim) => {
    const expr = fillColorExpression(dim) as unknown[];
    const step = (dim === "anv" ? expr : (expr[5] as unknown[])) as unknown[];
    expect(step[0]).toBe("step");
    const stops = step.slice(3).filter((_, i) => i % 2 === 0) as number[];
    for (let i = 1; i < stops.length; i++) expect(stops[i]).toBeGreaterThan(stops[i - 1]);
  });

  it("giver 'ingen data' for manglende værdier", () => {
    expect(colorForValue("aar", undefined)).toBe(NO_DATA_COLOR);
    expect(colorForValue("aar", 0)).toBe(NO_DATA_COLOR);
    expect(colorForValue("anv", 750)).toBe(NO_DATA_COLOR);
  });

  it("legenden matcher værdierne", () => {
    const legend = legendFor("aar");
    expect(legend.map((l) => l.color)).toContain(colorForValue("aar", 1935));
    expect(legend.at(-1)!.label).toBe("Ingen data");
    expect(colorForValue("anv", 120)).toBe(legendFor("anv")[0].color);
  });
});

describe("cache-friskhed", () => {
  const now = 1_000_000_000_000;
  it("er frisk i 7 dage", () => {
    expect(isStale({ fetchedAt: now - 6 * 864e5, sourceErrors: [] }, now)).toBe(false);
    expect(isStale({ fetchedAt: now - 8 * 864e5, sourceErrors: [] }, now)).toBe(true);
  });
  it("delvise svar prøves igen efter 5 minutter", () => {
    expect(isStale({ fetchedAt: now - 60_000, sourceErrors: ["VUR"] }, now)).toBe(false);
    expect(isStale({ fetchedAt: now - 6 * 60_000, sourceErrors: ["VUR"] }, now)).toBe(true);
  });
});

describe("parseBfe", () => {
  it("accepterer kun positive heltal", () => {
    expect(parseBfe("100165718")).toBe(100165718);
    expect(parseBfe("0")).toBeNull();
    expect(parseBfe("12abc")).toBeNull();
    expect(parseBfe(undefined)).toBeNull();
  });
});

describe("Adressevælger-mapping", () => {
  it("mapper husnumre og veje og deduplikerer", () => {
    expect(
      mapAdressevaelger([
        { type: "navngivenvejpostnummer", id: "v1", titel: "Smallegade, 2000 Frederiksberg" },
        { type: "husnummer", id: "h1", titel: "Smallegade 1, 2000 Frederiksberg" },
        { type: "husnummer", id: "h1", titel: "Smallegade 1, 2000 Frederiksberg" },
        { type: "adresse", id: "a1", titel: "Smallegade 1, 1. th, 2000 Frederiksberg", husnummerId: "h1" },
      ]),
    ).toEqual([
      { id: "Smallegade, 2000 Frederiksberg ", text: "Smallegade, 2000 Frederiksberg", kind: "vej" },
      { id: "h1", text: "Smallegade 1, 2000 Frederiksberg", kind: "adresse" },
      { id: "h1", text: "Smallegade 1, 1. th, 2000 Frederiksberg", kind: "adresse" },
    ]);
  });
});
