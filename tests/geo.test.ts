import { describe, expect, it } from "vitest";
import {
  bboxOf,
  bboxToUtmWkt,
  centerOf,
  parseWkt,
  utmToWgs,
  wgsToUtm,
  wktToWgs,
} from "../src/server/datafordeler/geo";

describe("reprojektion EPSG:25832 → WGS84", () => {
  it("rammer Københavns Rådhusplads", () => {
    const [lng, lat] = utmToWgs([724351.93, 6175804.02]);
    expect(lng).toBeCloseTo(12.5683, 4);
    expect(lat).toBeCloseTo(55.6761, 4);
  });

  it("er sin egen inverse", () => {
    const [x, y] = wgsToUtm([10.2039, 56.1629]);
    const [lng, lat] = utmToWgs([x, y]);
    expect(lng).toBeCloseTo(10.2039, 6);
    expect(lat).toBeCloseTo(56.1629, 6);
  });
});

describe("parseWkt", () => {
  it("parser POINT", () => {
    expect(parseWkt("POINT(725000.12 6174000.34)")).toEqual({
      type: "Point",
      coordinates: [725000.12, 6174000.34],
    });
  });

  it("parser POLYGON med hul og ignorerer Z", () => {
    const g = parseWkt("POLYGON Z((0 0 1,10 0 1,10 10 1,0 0 1),(1 1 0,2 1 0,2 2 0,1 1 0))");
    expect(g?.type).toBe("Polygon");
    expect(g && g.type === "Polygon" && g.coordinates[1][2]).toEqual([2, 2]);
  });

  it("parser MULTIPOLYGON", () => {
    const g = parseWkt("MULTIPOLYGON(((0 0,1 0,1 1,0 0)),((5 5,6 5,6 6,5 5)))");
    expect(g?.type).toBe("MultiPolygon");
    expect(g && g.type === "MultiPolygon" && g.coordinates.length).toBe(2);
  });

  it("returnerer null for tom eller ukendt WKT", () => {
    expect(parseWkt(null)).toBeNull();
    expect(parseWkt("LINESTRING(0 0,1 1)")).toBeNull();
    expect(parseWkt("POLYGON((garbage")).toBeNull();
  });
});

describe("bbox og center", () => {
  const square = wktToWgs(
    "POLYGON((724300 6175750,724400 6175750,724400 6175850,724300 6175850,724300 6175750))",
  )!;

  it("giver bbox i WGS84", () => {
    const b = bboxOf(square)!;
    expect(b[0]).toBeLessThan(b[2]);
    expect(b[1]).toBeLessThan(b[3]);
    expect(b[0]).toBeCloseTo(12.567, 2);
  });

  it("center ligger inde i bbox", () => {
    const [lng, lat] = centerOf(square)!;
    const b = bboxOf(square)!;
    expect(lng).toBeGreaterThan(b[0]);
    expect(lng).toBeLessThan(b[2]);
    expect(lat).toBeGreaterThan(b[1]);
    expect(lat).toBeLessThan(b[3]);
  });

  it("bygger et lukket UTM-polygon til spatiale filtre", () => {
    const wkt = bboxToUtmWkt([12.56, 55.67, 12.57, 55.68]);
    const g = parseWkt(wkt);
    expect(g?.type).toBe("Polygon");
    const ring = g && g.type === "Polygon" ? g.coordinates[0] : [];
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    expect(ring[0][0]).toBeGreaterThan(700000);
  });
});
