import type { AddressSuggestion, ResolvedAddress } from "../../lib/types";
import { DatafordelerError, gql, now, timeoutSignal } from "./client";
import { wktToWgs } from "./geo";
import type { RawEjendomsbeliggenhed, RawHusnummer } from "./normalize";
import { isActiveDar } from "./normalize";
import * as Q from "./queries";

// Adressesøgning (F8).
//
// Autocomplete: Klimadatastyrelsens Adressevælger (afløseren for DAWA's
// autocomplete; fonetisk søgning i DAR). Falder tilbage til et præfiks-opslag
// i DAR's GraphQL, hvis Adressevælger ikke svarer.
// Opslag af valgt adresse (koordinat + BFE) sker altid mod DAR/EBR/MAT GraphQL.

const MAX_RESULTS = 8;

type AvFund = {
  type: "husnummer" | "adresse" | "navngivenvejpostnummer" | "vejnavn";
  id?: string;
  titel: string;
  husnummerId?: string;
};

function env(name: string) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export async function searchAddresses(q: string): Promise<AddressSuggestion[]> {
  const term = q.trim().replace(/\s+/g, " ").slice(0, 73);
  if (term.length < 3) return [];
  if (env("ADRESSEVAELGER_DISABLED") !== "1") {
    try {
      return await searchAdressevaelger(term);
    } catch (err) {
      console.warn("[search] Adressevælger fejlede, bruger DAR-præfikssøgning:", (err as Error).message);
    }
  }
  return searchDarPrefix(term);
}

async function searchAdressevaelger(term: string): Promise<AddressSuggestion[]> {
  const base = (env("ADRESSEVAELGER_URL") ?? "https://adressevaelger.dk").replace(/\/+$/, "");
  const url = new URL(`${base}/husnumre/soeg`);
  url.searchParams.set("tekst", term);
  url.searchParams.set("maksimum", "30");
  url.searchParams.set("token", env("ADRESSEVAELGER_TOKEN") ?? "adressevaelger123");
  const res = await fetch(url, { signal: timeoutSignal(4000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { status?: string; beskrivelse?: string; fund?: AvFund[] };
  if (body.status && body.status !== "ok") throw new Error(body.beskrivelse ?? body.status);
  return mapAdressevaelger(body.fund ?? []);
}

export function mapAdressevaelger(fund: AvFund[]): AddressSuggestion[] {
  const out: AddressSuggestion[] = [];
  const seen = new Set<string>();
  for (const f of fund) {
    const text = f.titel?.trim();
    if (!text || seen.has(text)) continue;
    if (f.type === "husnummer" && f.id) out.push({ id: f.id, text, kind: "adresse" });
    else if (f.type === "adresse" && f.husnummerId) out.push({ id: f.husnummerId, text, kind: "adresse" });
    else if (f.type === "navngivenvejpostnummer" || f.type === "vejnavn")
      out.push({ id: `${text} `, text, kind: "vej" });
    else continue;
    seen.add(text);
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}

async function searchDarPrefix(term: string): Promise<AddressSuggestion[]> {
  // Præfikssøgning er case-sensitiv; DAR's betegnelser starter med stort bogstav.
  const q = term.charAt(0).toLocaleUpperCase("da") + term.slice(1);
  const t = now();
  const res = await gql<{ DAR_Husnummer: { nodes: RawHusnummer[] } }>("DAR", Q.DAR_HUSNUMRE_STARTS_WITH, {
    q,
    vt: t.vt,
    rt: t.rt,
  });
  return res.DAR_Husnummer.nodes
    .filter((h) => isActiveDar(h.status) && h.adgangsadressebetegnelse)
    .slice(0, MAX_RESULTS)
    .map((h) => ({ id: h.id_lokalId, text: h.adgangsadressebetegnelse!, kind: "adresse" as const }));
}

/** Slår et DAR-husnummer op og returnerer koordinat og BFE-nummer. */
export async function resolveAddress(husnummerId: string): Promise<ResolvedAddress> {
  if (!/^[0-9a-f-]{36}$/i.test(husnummerId)) {
    throw new DatafordelerError("Ugyldigt husnummer-id", 400, "Ugyldigt adresse-id.");
  }
  const t = now();
  const vars = { vt: t.vt, rt: t.rt };
  const [hnRes, ebrRes] = await Promise.all([
    gql<{ DAR_Husnummer: { nodes: RawHusnummer[] } }>("DAR", Q.DAR_HUSNUMMER_BY_ID, { id: husnummerId, ...vars }),
    gql<{ EBR_Ejendomsbeliggenhed: { nodes: RawEjendomsbeliggenhed[] } }>("EBR", Q.EBR_BY_HUSNUMMER, {
      id: husnummerId,
      ...vars,
    }).catch((err) => {
      console.warn("[resolve] EBR fejlede:", (err as Error).message);
      return null;
    }),
  ]);
  const hn = hnRes.DAR_Husnummer.nodes[0];
  if (!hn) throw new DatafordelerError("Husnummer ikke fundet", 404, "Adressen blev ikke fundet i DAR.");

  const [point, bfe] = await Promise.all([
    hn.adgangspunkt ? adressepunkt(hn.adgangspunkt, vars) : Promise.resolve(null),
    resolveBfe(ebrRes?.EBR_Ejendomsbeliggenhed.nodes ?? [], hn.jordstykke, vars),
  ]);
  if (!point) throw new DatafordelerError("Adgangspunkt mangler", 404, "Adressen har ingen koordinat.");
  return {
    id: hn.id_lokalId,
    text: hn.adgangsadressebetegnelse ?? "",
    ...(bfe ? { bfe } : {}),
    lng: point[0],
    lat: point[1],
  };
}

/** Foretræk ejendommen på husnummerniveau frem for enkelte ejerlejligheder. */
export function bfeFromEbr(rows: RawEjendomsbeliggenhed[]): number | undefined {
  const row = rows.find((r) => !r.adresseLokalId) ?? rows[0];
  const n = Number(row?.bestemtFastEjendomBFENr);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** BFE via EBR; falder tilbage til jordstykke → samlet fast ejendom i MAT. */
async function resolveBfe(
  ebr: RawEjendomsbeliggenhed[],
  jordstykke: string | null | undefined,
  vars: { vt: string; rt: string },
): Promise<number | undefined> {
  const fromEbr = bfeFromEbr(ebr);
  if (fromEbr) return fromEbr;
  if (!jordstykke) return undefined;
  try {
    return await bfeFromJordstykke(jordstykke, vars);
  } catch (err) {
    console.warn("[resolve] MAT-fallback fejlede:", (err as Error).message);
    return undefined;
  }
}

async function adressepunkt(id: string, vars: { vt: string; rt: string }): Promise<[number, number] | null> {
  const res = await gql<{ DAR_Adressepunkt: { nodes: { position: { wkt: string } | null }[] } }>(
    "DAR",
    Q.DAR_ADRESSEPUNKT_BY_ID,
    { id, ...vars },
  );
  const g = wktToWgs(res.DAR_Adressepunkt.nodes[0]?.position?.wkt);
  return g?.type === "Point" ? (g.coordinates as [number, number]) : null;
}

async function bfeFromJordstykke(jid: string, vars: { vt: string; rt: string }): Promise<number | undefined> {
  const js = await gql<{ MAT_Jordstykke: { nodes: { samletFastEjendomLokalId: string | null }[] } }>(
    "MAT",
    Q.MAT_JORDSTYKKER_BY_IDS,
    { ids: [jid], ...vars, after: null },
  );
  const sfeId = js.MAT_Jordstykke.nodes[0]?.samletFastEjendomLokalId;
  if (!sfeId) return undefined;
  const sfe = await gql<{ MAT_SamletFastEjendom: { nodes: { BFEnummer: number }[] } }>(
    "MAT",
    Q.MAT_SFE_BY_IDS,
    { ids: [sfeId], ...vars, after: null },
  );
  return sfe.MAT_SamletFastEjendom.nodes[0]?.BFEnummer ?? undefined;
}
