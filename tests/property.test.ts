import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatafordelerError } from "../src/server/datafordeler/client";
import { fetchPropertyCard } from "../src/server/datafordeler/property";
import { resolveAddress } from "../src/server/datafordeler/search";
import { fakeDatafordeler, standardHandlers } from "./fake-datafordeler";

beforeEach(() => {
  vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
  vi.stubEnv("DATAFORDELER_CLIENT_ID", "");
  vi.stubEnv("DATAFORDELER_CLIENT_SECRET", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("fetchPropertyCard", () => {
  it("samler MAT, BBR, DAR, EBR og VUR til ét ejendomskort", async () => {
    const fake = fakeDatafordeler(standardHandlers);
    vi.stubGlobal("fetch", fake.impl);

    const card = await fetchPropertyCard(100165718);

    expect(card.bfe).toBe(100165718);
    expect(card.matrikel).toEqual({ matrikelnr: "25b", ejerlav: "Frederiksberg", grundareal: 1210 });
    expect(card.addresses).toEqual([{ id: "hn-1", text: "Testvej 3, 2000 Frederiksberg" }]);
    expect(card.buildings.map((b) => b.id)).toEqual(["byg-1", "byg-2"]);
    expect(card.buildings[0]).toMatchObject({
      anvendelse: "Fritliggende enfamiliehus",
      opfoerelsesaar: 1928,
      samletBoligareal: 180,
      tag: "Tegl",
    });
    expect(card.valuation).toEqual({ aar: 2022, ejendomsvaerdi: 6_400_000, grundvaerdi: 2_550_000 });
    expect(card.sourceErrors).toEqual([]);
    expect(card.center!.lng).toBeGreaterThan(12.4);
    expect(card.center!.lng).toBeLessThan(12.6);
    expect(card.bbox).toHaveLength(4);

    // Alle bitemporale registre får virknings- og registreringstid; VUR gør ikke.
    for (const c of fake.calls) {
      if (c.root.startsWith("VUR_")) expect(c.vars).not.toHaveProperty("vt");
      else expect(c.vars.vt).toMatch(/^\d{4}-\d\d-\d\dT/);
      expect(c.url.searchParams.get("apiKey")).toBe("test-key");
    }
    expect(fake.calls.find((c) => c.root === "BBR_Bygning")!.url.pathname).toBe("/BBR/v3");
    expect(fake.calls.find((c) => c.root === "MAT_Jordstykke")!.url.pathname).toBe("/MAT/v2");
  });

  it("returnerer delvise data, når et register fejler", async () => {
    const fake = fakeDatafordeler(standardHandlers, { failRegisters: ["VUR"] });
    vi.stubGlobal("fetch", fake.impl);

    const card = await fetchPropertyCard(100165718);
    expect(card.sourceErrors).toEqual(["VUR"]);
    expect(card.valuation).toBeUndefined();
    expect(card.buildings).toHaveLength(2);
  });

  it("giver 404, når BFE ikke findes", async () => {
    vi.stubGlobal("fetch", fakeDatafordeler(standardHandlers).impl);
    const err = await fetchPropertyCard(999).catch((e) => e);
    expect(err).toBeInstanceOf(DatafordelerError);
    expect(err.status).toBe(404);
  });

  it("fejler med 503, når credentials mangler", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "");
    vi.stubGlobal("fetch", fakeDatafordeler(standardHandlers).impl);
    const err = await fetchPropertyCard(100165718).catch((e) => e);
    expect(err.status).toBe(503);
  });
});

describe("resolveAddress", () => {
  it("giver koordinat og BFE for et husnummer", async () => {
    vi.stubGlobal("fetch", fakeDatafordeler(standardHandlers).impl);
    const r = await resolveAddress("0a3f507a-b2e6-32b8-e044-0003ba298018");
    expect(r.bfe).toBe(100165718);
    expect(r.lng).toBeCloseTo(12.52, 1);
    expect(r.lat).toBeCloseTo(55.69, 1);
  });

  it("afviser ugyldige id'er", async () => {
    const err = await resolveAddress("../../etc").catch((e) => e);
    expect(err.status).toBe(400);
  });
});
