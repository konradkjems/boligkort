import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTileFeatures, gridCells, mapLimit, toLdGeoJson } from "../src/server/tileset/build";
import { publishToMts, recipeFor } from "../src/server/tileset/mts";
import { fakeDatafordeler, standardHandlers } from "./fake-datafordeler";

beforeEach(() => vi.stubEnv("DATAFORDELER_API_KEY", "k"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("gridCells", () => {
  it("dækker hele området uden at gå udenfor", () => {
    const cells = gridCells([12.5, 55.6, 12.51, 55.605], 0.006);
    expect(cells).toHaveLength(2);
    expect(Math.max(...cells.map((c) => c[2]))).toBe(12.51);
    expect(Math.max(...cells.map((c) => c[3]))).toBe(55.605);
  });
});

it("mapLimit bevarer rækkefølgen", async () => {
  const out = await mapLimit([30, 10, 20], 2, async (ms, i) => {
    await new Promise((r) => setTimeout(r, ms));
    return i;
  });
  expect(out).toEqual([0, 1, 2]);
});

describe("buildTileFeatures", () => {
  it("påfører jid, bfe, mnr, aar, anv og vm2", async () => {
    const fake = fakeDatafordeler({
      ...standardHandlers,
      MAT_Lodflade: () => [
        {
          id_lokalId: "lf-1",
          jordstykkeLokalId: "1538971",
          status: "Gældende",
          geometri: { wkt: "POLYGON((720500 6177000,720540 6177000,720540 6177030,720500 6177000))" },
        },
      ],
      MAT_SamletFastEjendom: () => [{ id_lokalId: "sfe-1", BFEnummer: 100165718 }],
      BBR_Bygning: () => [
        { id_lokalId: "b1", status: "6", jordstykke: "1538971", byg021BygningensAnvendelse: "120", byg026Opfoerelsesaar: 1928, byg041BebyggetAreal: 110 },
      ],
      BBR_GrundJordstykke: () => [],
    });
    vi.stubGlobal("fetch", fake.impl);
    const features = await buildTileFeatures([12.52, 55.69, 12.525, 55.692], { log: () => {} });
    expect(features).toHaveLength(1);
    expect(features[0].properties).toEqual({
      jid: "1538971",
      bfe: 100165718,
      mnr: "25b",
      aar: 1928,
      anv: 120,
      vm2: Math.round(6_400_000 / 1210),
    });
    expect(features[0].geometry.type).toBe("Polygon");
    expect(toLdGeoJson(features).trim().split("\n")).toHaveLength(1);
  });
});

describe("publishToMts", () => {
  it("erstatter source, opretter tileset og publicerer", async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(input));
      calls.push(`${init?.method} ${u.pathname}`);
      if (u.pathname.endsWith("/publish")) return Response.json({ jobId: "job1" });
      if (u.pathname.includes("/jobs/")) return Response.json({ stage: "success" });
      return Response.json({ ok: true });
    }) as typeof fetch;
    const p = publishToMts('{"type":"Feature"}\n', {
      token: "sk.x",
      username: "me",
      tileset: "ts",
      layer: "jordstykker",
      fetchImpl,
      log: () => {},
    });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe("me.ts");
    expect(calls).toEqual([
      "PUT /tilesets/v1/sources/me/ts",
      "POST /tilesets/v1/me.ts",
      "POST /tilesets/v1/me.ts/publish",
      "GET /tilesets/v1/me.ts/jobs/job1",
    ]);
    vi.useRealTimers();
  });

  it("recipe starter ved zoom 14", () => {
    const r = recipeFor({ username: "me", tileset: "ts", layer: "jordstykker" });
    expect(r.layers.jordstykker.minzoom).toBe(14);
    expect(r.layers.jordstykker.source).toBe("mapbox://tileset-source/me/ts");
  });
});
