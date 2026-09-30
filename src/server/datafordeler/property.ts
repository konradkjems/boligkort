import type { PropertyCard, Registry } from "../../lib/types";
import { DatafordelerError, chunk, gql, gqlAll, now } from "./client";
import { bboxOf, centerOf, wktToWgs } from "./geo";
import {
  isActiveMat,
  normalizeAddresses,
  normalizeBygninger,
  normalizeJordstykker,
  pickValuation,
  summarizeMatrikel,
  type RawBygning,
  type RawEjendomsbeliggenhed,
  type RawEjerlav,
  type RawHusnummer,
  type RawJordstykke,
  type RawVurdering,
} from "./normalize";
import * as Q from "./queries";

type SfeNode = {
  id_lokalId: string;
  BFEnummer: number;
  status?: string;
  hovedejendomOpdeltIEjerlejligh?: boolean;
  geometri?: { wkt: string | null } | null;
};

type Conn<N> = { nodes: N[] };

/**
 * Samler ejendomskortet for et BFE-nummer.
 *
 * MAT er påkrævet (uden matrikel intet kort). BBR, DAR/EBR og VUR hentes
 * parallelt; fejler et af dem, returneres resten med registret i sourceErrors.
 */
export async function fetchPropertyCard(bfe: number): Promise<PropertyCard> {
  const t = now();
  const vars = { vt: t.vt, rt: t.rt };

  const errors: Registry[] = [];
  const guard = async <T>(reg: Registry, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      console.warn(`[datafordeler] ${reg} fejlede for BFE ${bfe}:`, (err as Error).message);
      errors.push(reg);
      return fallback;
    }
  };

  // EBR og VUR kræver kun BFE, så de startes med det samme parallelt med MAT.
  const ebrP = guard("EBR", () => fetchEbr(bfe, vars), [] as RawEjendomsbeliggenhed[]);
  const vurP = guard("VUR", () => fetchVurderinger(bfe), [] as RawVurdering[]);

  // 1. MAT: Samlet fast ejendom. Er BFE'en en ejerlejlighed, bruges hovedejendommen.
  let sfe = await findSfe(bfe, vars);
  if (!sfe) {
    const ejl = await gql<{ MAT_Ejerlejlighed: Conn<{ samletFastEjendomLokalId: string | null }> }>(
      "MAT",
      Q.MAT_EJERLEJLIGHED_BY_BFE,
      { bfe, ...vars },
    );
    const parentId = ejl.MAT_Ejerlejlighed.nodes[0]?.samletFastEjendomLokalId;
    if (parentId) {
      const res = await gql<{ MAT_SamletFastEjendom: Conn<SfeNode> }>("MAT", Q.MAT_SFE_GEOM_BY_ID, {
        id: parentId,
        ...vars,
      });
      sfe = res.MAT_SamletFastEjendom.nodes[0] ?? null;
    }
  }
  if (!sfe) {
    await Promise.allSettled([ebrP, vurP]);
    throw new DatafordelerError(
      `BFE ${bfe} ikke fundet i MAT`,
      404,
      `Ejendommen med BFE-nummer ${bfe} blev ikke fundet i Matriklen.`,
    );
  }

  // 2. MAT: jordstykker.
  const rawJs = (
    await gqlAll<RawJordstykke>("MAT", "MAT_Jordstykke", Q.MAT_JORDSTYKKER_BY_SFE, {
      sfe: sfe.id_lokalId,
      ...vars,
    })
  ).filter((j) => isActiveMat(j.status));
  const jids = rawJs.map((j) => j.id_lokalId);
  const ejerlavIds = [...new Set(rawJs.map((j) => j.ejerlavLokalId).filter(Boolean))] as string[];

  // 3. Ejerlav, BBR og DAR parallelt (EBR/VUR kører allerede).
  const [ejerlav, buildings, husnumre, ebr, valuation] = await Promise.all([
    guard("MAT", () => fetchEjerlav(ejerlavIds, vars), [] as RawEjerlav[]),
    guard("BBR", () => fetchBygninger(jids, vars), [] as RawBygning[]),
    guard("DAR", () => fetchHusnumre(jids, vars), [] as RawHusnummer[]),
    ebrP,
    vurP,
  ]);
  const jordstykker = normalizeJordstykker(rawJs, ejerlav);

  const geom = wktToWgs(sfe.geometri?.wkt);
  const bbox = geom ? bboxOf(geom) : null;
  const center = geom ? centerOf(geom) : null;
  const val = pickValuation(valuation);

  return {
    bfe,
    matrikel: summarizeMatrikel(jordstykker),
    jordstykker,
    addresses: normalizeAddresses(ebr, husnumre),
    buildings: normalizeBygninger(buildings),
    ...(val ? { valuation: val } : {}),
    ...(center ? { center: { lng: center[0], lat: center[1] } } : {}),
    ...(bbox ? { bbox } : {}),
    fetchedAt: Date.now(),
    sourceErrors: [...new Set(errors)].sort(),
  };
}

async function fetchEjerlav(ids: string[], vars: { vt: string; rt: string }) {
  if (!ids.length) return [];
  const res = await gql<{ MAT_Ejerlav: Conn<RawEjerlav> }>("MAT", Q.MAT_EJERLAV_BY_IDS, {
    ids: ids.slice(0, 100),
    ...vars,
  });
  return res.MAT_Ejerlav.nodes;
}

async function findSfe(bfe: number, vars: { vt: string; rt: string }): Promise<SfeNode | null> {
  const res = await gql<{ MAT_SamletFastEjendom: Conn<SfeNode> }>("MAT", Q.MAT_SFE_BY_BFE, {
    bfe,
    ...vars,
  });
  return res.MAT_SamletFastEjendom.nodes[0] ?? null;
}

/**
 * Bygninger på ejendommens jordstykker. BBR_Bygning.jordstykke er ikke altid
 * udfyldt, så vi supplerer via BBR_GrundJordstykke → BBR_Bygning.grund.
 */
async function fetchBygninger(jids: string[], vars: { vt: string; rt: string }) {
  if (!jids.length) return [];
  const groups = chunk(jids);
  const [direct, grundLinks] = await Promise.all([
    Promise.all(
      groups.map((ids) =>
        gqlAll<RawBygning>("BBR", "BBR_Bygning", Q.BBR_BYGNINGER_BY_JORDSTYKKER, { ids, ...vars }),
      ),
    ).then((r) => r.flat()),
    Promise.all(
      groups.map((ids) =>
        gqlAll<{ grund: string | null }>("BBR", "BBR_GrundJordstykke", Q.BBR_GRUNDJORDSTYKKER, {
          ids,
          ...vars,
        }),
      ),
    ).then((r) => r.flat()),
  ]);
  const grundIds = [...new Set(grundLinks.map((g) => g.grund).filter(Boolean))] as string[];
  const viaGrund = grundIds.length
    ? (
        await Promise.all(
          chunk(grundIds).map((ids) =>
            gqlAll<RawBygning>("BBR", "BBR_Bygning", Q.BBR_BYGNINGER_BY_GRUNDE, { ids, ...vars }),
          ),
        )
      ).flat()
    : [];
  return [...direct, ...viaGrund];
}

async function fetchEbr(bfe: number, vars: { vt: string; rt: string }) {
  const res = await gql<{ EBR_Ejendomsbeliggenhed: Conn<RawEjendomsbeliggenhed> }>(
    "EBR",
    Q.EBR_BY_BFE,
    { bfe: String(bfe), ...vars },
  );
  return res.EBR_Ejendomsbeliggenhed.nodes;
}

async function fetchHusnumre(jids: string[], vars: { vt: string; rt: string }) {
  if (!jids.length) return [];
  const pages = await Promise.all(
    chunk(jids).map((ids) =>
      gqlAll<RawHusnummer>("DAR", "DAR_Husnummer", Q.DAR_HUSNUMRE_BY_JORDSTYKKER, { ids, ...vars }),
    ),
  );
  return pages.flat();
}

async function fetchVurderinger(bfe: number): Promise<RawVurdering[]> {
  const refs = await gql<{ VUR_BFEKrydsreference: Conn<{ fkEjendomsvurderingID: number | null }> }>(
    "VUR",
    Q.VUR_KRYDSREF_BY_BFE,
    { bfe },
  );
  const ids = [
    ...new Set(refs.VUR_BFEKrydsreference.nodes.map((n) => n.fkEjendomsvurderingID).filter(Boolean)),
  ] as number[];
  if (!ids.length) return [];
  const pages = await Promise.all(
    chunk(ids).map((group) =>
      gqlAll<RawVurdering>("VUR", "VUR_Ejendomsvurdering", Q.VUR_VURDERINGER_BY_IDS, { ids: group }),
    ),
  );
  return pages.flat();
}
