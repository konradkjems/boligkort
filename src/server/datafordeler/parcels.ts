import { chunk, gqlAll, now } from "./client";
import { bboxToUtmWkt, toWgsGeometry, parseWkt, type Bbox } from "./geo";
import { isActiveMat, type RawJordstykke } from "./normalize";
import * as Q from "./queries";

// Jordstykkepolygoner for et udsnit som GeoJSON. Bruges som fallback for
// matrikellaget, indtil MTS-tilesettet er bygget, og af tileset-pipelinen.

export type ParcelProps = { jid: string; bfe?: number; mnr?: string };

/** Ekstra oplysninger pr. jordstykke til tileset-pipelinen. */
export type ParcelMeta = Map<string, { areal: number; bfe?: number }>;

export type Lodflade = { jordstykkeLokalId: string; status?: string; geometri: { wkt: string | null } | null };

export async function fetchParcelsInBbox(bbox: Bbox): Promise<GeoJSON.FeatureCollection> {
  const t = now();
  const vars = { vt: t.vt, rt: t.rt };
  const flader = await gqlAll<Lodflade>(
    "MAT",
    "MAT_Lodflade",
    Q.MAT_LODFLADER_IN_AREA,
    { wkt: bboxToUtmWkt(bbox), ...vars },
    { maxPages: 5, timeoutMs: 8000 },
  );
  return enrichLodflader(flader, vars);
}

/** Samler lodflader pr. jordstykke og påfører matrikelnr. og BFE. */
export async function enrichLodflader(
  flader: Lodflade[],
  vars: { vt: string; rt: string },
  meta?: ParcelMeta,
): Promise<GeoJSON.FeatureCollection> {
  const polys = new Map<string, GeoJSON.Position[][][]>();
  for (const f of flader) {
    if (!isActiveMat(f.status)) continue;
    const g = parseWkt(f.geometri?.wkt);
    if (!g || g.type === "Point") continue;
    const wgs = toWgsGeometry(g) as GeoJSON.Polygon | GeoJSON.MultiPolygon;
    const list = polys.get(f.jordstykkeLokalId) ?? [];
    if (wgs.type === "Polygon") list.push(wgs.coordinates);
    else list.push(...wgs.coordinates);
    polys.set(f.jordstykkeLokalId, list);
  }
  const jids = [...polys.keys()];
  const jordstykker = (
    await Promise.all(
      chunk(jids).map((ids) =>
        gqlAll<RawJordstykke>("MAT", "MAT_Jordstykke", Q.MAT_JORDSTYKKER_BY_IDS, { ids, ...vars }),
      ),
    )
  ).flat();
  const sfeIds = [...new Set(jordstykker.map((j) => j.samletFastEjendomLokalId).filter(Boolean))] as string[];
  const sfes = (
    await Promise.all(
      chunk(sfeIds).map((ids) =>
        gqlAll<{ id_lokalId: string; BFEnummer: number }>(
          "MAT",
          "MAT_SamletFastEjendom",
          Q.MAT_SFE_BY_IDS,
          { ids, ...vars },
        ),
      ),
    )
  ).flat();
  const bfeBySfe = new Map(sfes.map((s) => [s.id_lokalId, s.BFEnummer]));
  const jsById = new Map(jordstykker.map((j) => [j.id_lokalId, j]));

  const features: GeoJSON.Feature[] = [];
  for (const [jid, rings] of polys) {
    const js = jsById.get(jid);
    const bfe = js?.samletFastEjendomLokalId ? bfeBySfe.get(js.samletFastEjendomLokalId) : undefined;
    const props: ParcelProps = { jid };
    if (bfe) props.bfe = Number(bfe);
    if (js?.matrikelnummer) props.mnr = js.matrikelnummer;
    meta?.set(jid, { areal: Number(js?.registreretAreal ?? 0), bfe: props.bfe });
    features.push({
      type: "Feature",
      id: jid,
      properties: props,
      geometry:
        rings.length === 1
          ? { type: "Polygon", coordinates: rings[0] }
          : { type: "MultiPolygon", coordinates: rings },
    });
  }
  return { type: "FeatureCollection", features };
}

