// Offentlig (klient-side) konfiguration. NEXT_PUBLIC_* indlejres ved build.

export const publicConfig = {
  mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "",
  /** Fx "brugernavn.ejendomskort-jordstykker". Tom = GeoJSON-fallback fra /api/jordstykker. */
  tilesetId: process.env.NEXT_PUBLIC_MAPBOX_TILESET_ID ?? "",
  tilesetLayer: process.env.NEXT_PUBLIC_MAPBOX_TILESET_LAYER || "jordstykker",
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL ?? "",
  /** Startvisning for pilotområdet: "lng,lat,zoom". Standard: Frederiksberg. */
  initialView: parseView(process.env.NEXT_PUBLIC_INITIAL_VIEW) ?? {
    lng: 12.5323,
    lat: 55.6794,
    zoom: 14.5,
  },
};

function parseView(raw: string | undefined) {
  if (!raw) return null;
  const [lng, lat, zoom] = raw.split(",").map(Number);
  if (![lng, lat, zoom].every(Number.isFinite)) return null;
  return { lng, lat, zoom };
}

/** Minimumszoom for matrikellaget (F2). */
export const PARCEL_MIN_ZOOM = 14;
/** GeoJSON-fallbacken henter kun jordstykker ved høj zoom for at begrænse kald. */
export const PARCEL_FALLBACK_MIN_ZOOM = 16;
/** Cachens levetid (7 dage) jf. PRD. */
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
