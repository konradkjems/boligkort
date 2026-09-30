import proj4 from "proj4";

// Datafordeleren leverer geometri som WKT i EPSG:25832 (ETRS89 / UTM 32N).
// Kortet bruger WGS84 (EPSG:4326).

proj4.defs(
  "EPSG:25832",
  "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs",
);

const toWgs = proj4("EPSG:25832", "EPSG:4326");

export type Position = [number, number];
export type Bbox = [number, number, number, number];

export function utmToWgs([x, y]: Position): Position {
  const [lng, lat] = toWgs.forward([x, y]);
  return [round(lng, 7), round(lat, 7)];
}

export function wgsToUtm([lng, lat]: Position): Position {
  const [x, y] = toWgs.inverse([lng, lat]);
  return [round(x, 2), round(y, 2)];
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

// --- WKT --------------------------------------------------------------------

export type ParsedGeometry =
  | { type: "Point"; coordinates: Position }
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] };

/** Parser POINT, POLYGON og MULTIPOLYGON (evt. med Z, som ignoreres). */
export function parseWkt(wkt: string | null | undefined): ParsedGeometry | null {
  if (!wkt) return null;
  const m = wkt.trim().match(/^(?:SRID=\d+;)?\s*(POINT|POLYGON|MULTIPOLYGON)\s*(?:Z|M|ZM)?\s*(\(.*\))\s*$/is);
  if (!m) return null;
  const kind = m[1].toUpperCase();
  let body: unknown;
  try {
    // Omskriv "(x y, x y)" til JSON-arrays: "[[x,y],[x,y]]".
    const json = m[2]
      .replace(/(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s+(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)(?:\s+-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)*/g, "[$1,$2]")
      .replace(/\(/g, "[")
      .replace(/\)/g, "]");
    body = JSON.parse(json);
  } catch {
    return null;
  }
  if (kind === "POINT") {
    const p = (body as Position[])[0];
    return Array.isArray(p) && p.length === 2 ? { type: "Point", coordinates: p } : null;
  }
  if (kind === "POLYGON") return { type: "Polygon", coordinates: body as Position[][] };
  return { type: "MultiPolygon", coordinates: body as Position[][][] };
}

/** Reprojicerer en parset geometri fra EPSG:25832 til WGS84. */
export function toWgsGeometry(g: ParsedGeometry): GeoJSON.Geometry {
  switch (g.type) {
    case "Point":
      return { type: "Point", coordinates: utmToWgs(g.coordinates) };
    case "Polygon":
      return { type: "Polygon", coordinates: g.coordinates.map((r) => r.map(utmToWgs)) };
    case "MultiPolygon":
      return {
        type: "MultiPolygon",
        coordinates: g.coordinates.map((p) => p.map((r) => r.map(utmToWgs))),
      };
  }
}

export function wktToWgs(wkt: string | null | undefined): GeoJSON.Geometry | null {
  const g = parseWkt(wkt);
  return g ? toWgsGeometry(g) : null;
}

export function bboxOf(geom: GeoJSON.Geometry): Bbox | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const visit = (c: unknown): void => {
    if (typeof (c as number[])[0] === "number") {
      const [x, y] = c as number[];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    } else (c as unknown[]).forEach(visit);
  };
  if (geom.type === "GeometryCollection") return null;
  visit(geom.coordinates);
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

export function unionBbox(boxes: (Bbox | null | undefined)[]): Bbox | null {
  const valid = boxes.filter((b): b is Bbox => Boolean(b));
  if (!valid.length) return null;
  return [
    Math.min(...valid.map((b) => b[0])),
    Math.min(...valid.map((b) => b[1])),
    Math.max(...valid.map((b) => b[2])),
    Math.max(...valid.map((b) => b[3])),
  ];
}

/** Arealvægtet centroide af den største polygon (godt nok til at flyve kortet). */
export function centerOf(geom: GeoJSON.Geometry): Position | null {
  if (geom.type === "Point") return geom.coordinates as Position;
  const polys: Position[][][] =
    geom.type === "Polygon"
      ? [geom.coordinates as Position[][]]
      : geom.type === "MultiPolygon"
        ? (geom.coordinates as Position[][][])
        : [];
  let best: { area: number; c: Position } | null = null;
  for (const poly of polys) {
    const ring = poly[0];
    if (!ring || ring.length < 3) continue;
    let a = 0,
      cx = 0,
      cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      a += f;
      cx += (ring[j][0] + ring[i][0]) * f;
      cy += (ring[j][1] + ring[i][1]) * f;
    }
    if (a === 0) continue;
    const c: Position = [cx / (3 * a), cy / (3 * a)];
    if (!best || Math.abs(a) > best.area) best = { area: Math.abs(a), c };
  }
  return best ? [round(best.c[0], 7), round(best.c[1], 7)] : null;
}

/** WGS84-bbox → WKT-polygon i EPSG:25832 til spatiale filtre. */
export function bboxToUtmWkt([w, s, e, n]: Bbox): string {
  const corners: Position[] = [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ];
  const pts = corners.map((p) => wgsToUtm(p).join(" "));
  return `POLYGON((${pts.join(",")}))`;
}
