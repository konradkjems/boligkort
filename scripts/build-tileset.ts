// Bygger matrikel-tilesettet for pilotområdet og publicerer det til Mapbox.
//
//   npm run tileset                   # byg + upload (kræver MAPBOX_SECRET_TOKEN)
//   npm run tileset -- --dry-run      # byg kun data/jordstykker.ldgeojson
//
// Miljø: DATAFORDELER_* (se README), PILOT_BBOX="minLng,minLat,maxLng,maxLat",
// MAPBOX_SECRET_TOKEN, MAPBOX_USERNAME, MAPBOX_TILESET (standard ejendomskort-jordstykker),
// NEXT_PUBLIC_MAPBOX_TILESET_LAYER (standard jordstykker).

import { mkdir, writeFile } from "node:fs/promises";
import { isConfigured } from "../src/server/datafordeler/client";
import type { Bbox } from "../src/server/datafordeler/geo";
import { buildTileFeatures, toLdGeoJson } from "../src/server/tileset/build";
import { publishToMts } from "../src/server/tileset/mts";

// Standard-pilot: Frederiksberg Kommune.
const DEFAULT_BBOX: Bbox = [12.4895, 55.6655, 12.5605, 55.6975];

function parseBbox(raw: string | undefined): Bbox {
  if (!raw) return DEFAULT_BBOX;
  const b = raw.split(",").map(Number);
  if (b.length !== 4 || !b.every(Number.isFinite) || b[0] >= b[2] || b[1] >= b[3]) {
    throw new Error(`Ugyldig PILOT_BBOX: ${raw}`);
  }
  return b as Bbox;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!isConfigured()) throw new Error("Sæt DATAFORDELER_CLIENT_ID/SECRET eller DATAFORDELER_API_KEY.");
  const bbox = parseBbox(process.env.PILOT_BBOX);
  const started = Date.now();

  const features = await buildTileFeatures(bbox);
  const body = toLdGeoJson(features);
  await mkdir("data", { recursive: true });
  await writeFile("data/jordstykker.ldgeojson", body);
  console.log(`Skrev ${features.length} jordstykker til data/jordstykker.ldgeojson (${(body.length / 1e6).toFixed(1)} MB)`);

  if (dryRun) return;
  const token = process.env.MAPBOX_SECRET_TOKEN;
  const username = process.env.MAPBOX_USERNAME;
  if (!token || !username) throw new Error("Sæt MAPBOX_SECRET_TOKEN og MAPBOX_USERNAME (eller brug --dry-run).");
  const id = await publishToMts(body, {
    token,
    username,
    tileset: process.env.MAPBOX_TILESET || "ejendomskort-jordstykker",
    layer: process.env.NEXT_PUBLIC_MAPBOX_TILESET_LAYER || "jordstykker",
  });
  console.log(`Færdig på ${Math.round((Date.now() - started) / 1000)} s. Sæt NEXT_PUBLIC_MAPBOX_TILESET_ID=${id}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
