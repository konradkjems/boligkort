import { chunk, gqlAll, now } from "../datafordeler/client";
import { bboxToUtmWkt, type Bbox } from "../datafordeler/geo";
import { summarizeForTiles, pickValuation, type RawBygning, type RawVurdering } from "../datafordeler/normalize";
import { enrichLodflader, type Lodflade, type ParcelMeta } from "../datafordeler/parcels";
import * as Q from "../datafordeler/queries";

// Bygger features til matrikel-tilesettet for et pilotområde.
// Properties pr. jordstykke (PRD): jid, bfe, mnr, aar, anv, vm2.

export type TileProps = {
  jid: string;
  bfe?: number;
  mnr?: string;
  aar?: number;
  anv?: number;
  vm2?: number;
};

type Log = (msg: string) => void;

/** Deler et område op i celler, så hvert spatialt kald holder sig under Datafordelerens cost-grænse. */
export function gridCells([w, s, e, n]: Bbox, step = 0.006): Bbox[] {
  const cells: Bbox[] = [];
  for (let x = w; x < e; x += step) {
    for (let y = s; y < n; y += step) {
      cells.push([x, y, Math.min(x + step, e), Math.min(y + step, n)]);
    }
  }
  return cells;
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

const OPTS = { timeoutMs: 30_000, maxPages: 50 };

export async function buildTileFeatures(
  bbox: Bbox,
  { log = console.log, concurrency = 4 }: { log?: Log; concurrency?: number } = {},
): Promise<GeoJSON.Feature<GeoJSON.Geometry, TileProps>[]> {
  const t = now();
  const vars = { vt: t.vt, rt: t.rt };
  const cells = gridCells(bbox);
  log(`Område ${bbox.join(",")} → ${cells.length} celler`);

  // 1. Jordstykkepolygoner (MAT_Lodflade), dedupliceret på lodflade-id.
  const fladerById = new Map<string, Lodflade & { id_lokalId?: string }>();
  await mapLimit(cells, concurrency, async (cell, i) => {
    const rows = await gqlAll<Lodflade & { id_lokalId: string }>(
      "MAT",
      "MAT_Lodflade",
      Q.MAT_LODFLADER_IN_AREA,
      { wkt: bboxToUtmWkt(cell), ...vars },
      OPTS,
    );
    for (const r of rows) fladerById.set(r.id_lokalId ?? `${r.jordstykkeLokalId}:${fladerById.size}`, r);
    if ((i + 1) % 10 === 0) log(`  MAT: ${i + 1}/${cells.length} celler, ${fladerById.size} lodflader`);
  });

  // 2. Matrikelnr. og BFE.
  const meta: ParcelMeta = new Map();
  const fc = await enrichLodflader([...fladerById.values()], vars, meta);
  log(`MAT: ${fc.features.length} jordstykker`);

  // 3. BBR: bygninger i området → aar/anv pr. jordstykke.
  const bygninger = new Map<string, RawBygning>();
  await mapLimit(cells, concurrency, async (cell) => {
    const rows = await gqlAll<RawBygning>("BBR", "BBR_Bygning", Q.BBR_BYGNINGER_IN_AREA, { wkt: bboxToUtmWkt(cell), ...vars }, OPTS);
    for (const r of rows) bygninger.set(r.id_lokalId, r);
  });
  const grundUdenJordstykke = [
    ...new Set([...bygninger.values()].filter((b) => !b.jordstykke && b.grund).map((b) => b.grund!)),
  ];
  const grundTilJordstykke = new Map<string, string>();
  await mapLimit(chunk(grundUdenJordstykke), concurrency, async (ids) => {
    const rows = await gqlAll<{ grund: string; jordstykke: string }>(
      "BBR",
      "BBR_GrundJordstykke",
      Q.BBR_GRUNDJORDSTYKKER_BY_GRUNDE,
      { ids, ...vars },
      OPTS,
    );
    for (const r of rows) if (r.grund && r.jordstykke && !grundTilJordstykke.has(r.grund)) grundTilJordstykke.set(r.grund, r.jordstykke);
  });
  const byJordstykke = new Map<string, RawBygning[]>();
  for (const b of bygninger.values()) {
    const jid = b.jordstykke ?? (b.grund ? grundTilJordstykke.get(b.grund) : undefined);
    if (!jid) continue;
    const list = byJordstykke.get(jid) ?? [];
    list.push(b);
    byJordstykke.set(jid, list);
  }
  log(`BBR: ${bygninger.size} bygninger på ${byJordstykke.size} jordstykker`);

  // 4. VUR: seneste ejendomsværdi pr. BFE → vm2 = værdi / samlet grundareal.
  const bfes = [...new Set([...meta.values()].map((m) => m.bfe).filter((b): b is number => !!b))];
  const arealByBfe = new Map<number, number>();
  for (const m of meta.values()) if (m.bfe) arealByBfe.set(m.bfe, (arealByBfe.get(m.bfe) ?? 0) + m.areal);
  const vurderingIdsByBfe = new Map<number, number[]>();
  await mapLimit(chunk(bfes), concurrency, async (group) => {
    const rows = await gqlAll<{ BFEnummer: number; fkEjendomsvurderingID: number }>(
      "VUR",
      "VUR_BFEKrydsreference",
      Q.VUR_KRYDSREF_BY_BFES,
      { bfes: group },
      OPTS,
    );
    for (const r of rows) {
      const list = vurderingIdsByBfe.get(r.BFEnummer) ?? [];
      list.push(r.fkEjendomsvurderingID);
      vurderingIdsByBfe.set(r.BFEnummer, list);
    }
  });
  const allIds = [...new Set([...vurderingIdsByBfe.values()].flat())];
  const vurderingById = new Map<number, RawVurdering>();
  await mapLimit(chunk(allIds), concurrency, async (ids) => {
    const rows = await gqlAll<RawVurdering>("VUR", "VUR_Ejendomsvurdering", Q.VUR_VURDERINGER_BY_IDS, { ids }, OPTS);
    for (const r of rows) vurderingById.set(r.id, r);
  });
  const vm2ByBfe = new Map<number, number>();
  for (const [bfe, ids] of vurderingIdsByBfe) {
    const v = pickValuation(ids.map((id) => vurderingById.get(id)).filter((r): r is RawVurdering => !!r));
    const areal = arealByBfe.get(bfe) ?? 0;
    if (v && v.ejendomsvaerdi > 0 && areal > 0) vm2ByBfe.set(bfe, Math.round(v.ejendomsvaerdi / areal));
  }
  log(`VUR: værdi/m² for ${vm2ByBfe.size} af ${bfes.length} ejendomme`);

  // 5. Saml properties (kun felter med værdi, så tilesettet holdes småt).
  return fc.features.map((f) => {
    const p = f.properties as TileProps;
    const s = summarizeForTiles(byJordstykke.get(p.jid) ?? []);
    const vm2 = p.bfe ? vm2ByBfe.get(p.bfe) : undefined;
    const props: TileProps = { jid: p.jid };
    if (p.bfe) props.bfe = p.bfe;
    if (p.mnr) props.mnr = p.mnr;
    if (s.aar) props.aar = s.aar;
    if (s.anv) props.anv = s.anv;
    if (vm2) props.vm2 = vm2;
    return { type: "Feature", geometry: f.geometry, properties: props };
  });
}

/** Line-delimited GeoJSON, som Mapbox Tiling Service forventer. */
export function toLdGeoJson(features: GeoJSON.Feature[]): string {
  return features.map((f) => JSON.stringify(f)).join("\n") + "\n";
}
