import { DatafordelerError, fetchParcelsInBbox } from "@/server/datafordeler";

// GeoJSON-fallback for matrikellaget, når der ikke er et MTS-tileset.
// Udsnittet begrænses, så et enkelt kald ikke kan hente en hel kommune.
const MAX_SPAN_DEG = 0.03;

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("bbox") ?? "";
  const bbox = raw.split(",").map(Number);
  if (bbox.length !== 4 || !bbox.every(Number.isFinite)) {
    return Response.json({ error: "bbox skal være minLng,minLat,maxLng,maxLat" }, { status: 400 });
  }
  const [w, s, e, n] = bbox;
  if (e <= w || n <= s || e - w > MAX_SPAN_DEG || n - s > MAX_SPAN_DEG) {
    return Response.json({ error: "Udsnittet er for stort. Zoom ind." }, { status: 400 });
  }
  try {
    const fc = await fetchParcelsInBbox([w, s, e, n]);
    return Response.json(fc, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch (err) {
    const status = err instanceof DatafordelerError ? err.status : 502;
    if (!(err instanceof DatafordelerError)) console.error(err);
    return Response.json({ error: "Matrikler kunne ikke hentes." }, { status });
  }
}
