import {
  ANVENDELSE,
  OPVARMNINGSMIDDEL,
  TAGDAEKNING,
  VARMEINSTALLATION,
  YDERVAEG,
  lookup,
} from "../../lib/bbr-codes";
import type { Address, Building, Jordstykke, Matrikel, Valuation } from "../../lib/types";

// Rå node-typer (kun de felter vi beder om).

export type RawJordstykke = {
  id_lokalId: string;
  matrikelnummer: string | null;
  registreretAreal: number | null;
  ejerlavLokalId: string | null;
  samletFastEjendomLokalId: string | null;
  status?: string | null;
};

export type RawEjerlav = {
  id_lokalId: string;
  ejerlavskode: number | null;
  ejerlavsnavn: string | null;
};

export type RawBygning = {
  id_lokalId: string;
  status?: string | null;
  grund?: string | null;
  jordstykke?: string | null;
  husnummer?: string | null;
  byg007Bygningsnummer?: number | null;
  byg021BygningensAnvendelse?: string | null;
  byg026Opfoerelsesaar?: number | null;
  byg027OmTilbygningsaar?: number | null;
  byg032YdervaeggensMateriale?: string | null;
  byg033Tagdaekningsmateriale?: string | null;
  byg038SamletBygningsareal?: number | null;
  byg039BygningensSamledeBoligAreal?: number | null;
  byg040BygningensSamledeErhvervsAreal?: number | null;
  byg041BebyggetAreal?: number | null;
  byg054AntalEtager?: number | null;
  byg056Varmeinstallation?: string | null;
  byg057Opvarmningsmiddel?: string | null;
};

export type RawHusnummer = {
  id_lokalId: string;
  adgangsadressebetegnelse: string | null;
  husnummertekst?: string | null;
  status?: string | null;
  jordstykke?: string | null;
  adgangspunkt?: string | null;
};

export type RawEjendomsbeliggenhed = {
  id_lokalId: string;
  bestemtFastEjendomBFENr: string | null;
  husnummerLokalId: string | null;
  adresseLokalId: string | null;
  betegnelse: string | null;
  status?: string | null;
};

export type RawVurdering = {
  id: number;
  aar: number | null;
  ejendomvaerdiBeloeb: number | null;
  grundvaerdiBeloeb: number | null;
};

// --- Status-filtre -------------------------------------------------------------
// Bitemporale argumenter giver den aktuelle version, men den aktuelle version
// kan have en livscyklusstatus som "nedrevet"/"henlagt". Dem sorterer vi fra.

/** BBR-livscyklus: 2 Projekteret, 3 Under opførsel, 6 Opført, 7 Gældende, 12 Midlertidig afsluttet, 13 Delvis afsluttet. */
const BBR_ACTIVE = new Set(["2", "3", "6", "7", "12", "13"]);

export function isActiveBygning(b: RawBygning): boolean {
  return b.status == null || BBR_ACTIVE.has(String(b.status));
}

/** DAR-status: 2 Foreløbig, 3 Gældende (4 Nedlagt, 5 Henlagt sorteres fra). */
export function isActiveDar(status: string | null | undefined): boolean {
  return status == null || status === "2" || status === "3" || /gæld|gaeld|forel/i.test(status);
}

/** MAT-status: "Gældende" og "Foreløbig" beholdes. */
export function isActiveMat(status: string | null | undefined): boolean {
  return status == null || !/histor|nedlag|afregist|slettet|henlag/i.test(status);
}

// --- Normalisering -----------------------------------------------------------

export function normalizeJordstykker(
  raw: RawJordstykke[],
  ejerlav: RawEjerlav[],
): Jordstykke[] {
  const byId = new Map(ejerlav.map((e) => [e.id_lokalId, e]));
  return raw
    .filter((j) => isActiveMat(j.status))
    .map((j) => {
      const e = j.ejerlavLokalId ? byId.get(j.ejerlavLokalId) : undefined;
      return {
        id: j.id_lokalId,
        matrikelnr: j.matrikelnummer ?? "?",
        ejerlav: e?.ejerlavsnavn ?? "Ukendt ejerlav",
        ...(e?.ejerlavskode != null ? { ejerlavskode: Number(e.ejerlavskode) } : {}),
        areal: Number(j.registreretAreal ?? 0),
      };
    })
    .sort((a, b) => b.areal - a.areal);
}

/** Samlet matrikel for ejendommen: største jordstykke + summeret grundareal. */
export function summarizeMatrikel(jordstykker: Jordstykke[]): Matrikel {
  if (!jordstykker.length) return { matrikelnr: "?", ejerlav: "Ukendt ejerlav", grundareal: 0 };
  const [primary] = jordstykker;
  const sameEjerlav = jordstykker.every((j) => j.ejerlav === primary.ejerlav);
  const nrs = jordstykker.map((j) => j.matrikelnr);
  return {
    matrikelnr: sameEjerlav && nrs.length <= 4 ? nrs.join(", ") : primary.matrikelnr,
    ejerlav: primary.ejerlav,
    grundareal: jordstykker.reduce((s, j) => s + j.areal, 0),
  };
}

function num(v: number | string | null | undefined): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function positive(v: number | string | null | undefined): number | undefined {
  const n = num(v);
  return n !== undefined && n > 0 ? n : undefined;
}

export function normalizeBygning(b: RawBygning): Building {
  const anv = num(b.byg021BygningensAnvendelse);
  const out: Building = {
    id: b.id_lokalId,
    nummer: num(b.byg007Bygningsnummer),
    anvendelseKode: anv,
    anvendelse: lookup(ANVENDELSE, anv),
    opfoerelsesaar: positive(b.byg026Opfoerelsesaar),
    ombygningsaar: positive(b.byg027OmTilbygningsaar),
    bebyggetAreal: num(b.byg041BebyggetAreal),
    samletBygningsareal: num(b.byg038SamletBygningsareal),
    samletBoligareal: num(b.byg039BygningensSamledeBoligAreal),
    samletErhvervsareal: num(b.byg040BygningensSamledeErhvervsAreal),
    etager: num(b.byg054AntalEtager),
    tag: lookup(TAGDAEKNING, b.byg033Tagdaekningsmateriale),
    ydervaeg: lookup(YDERVAEG, b.byg032YdervaeggensMateriale),
    varmeinstallation: lookup(VARMEINSTALLATION, b.byg056Varmeinstallation),
    opvarmningsmiddel: lookup(OPVARMNINGSMIDDEL, b.byg057Opvarmningsmiddel),
  };
  // Convex gemmer ikke undefined-felter i v.any(); fjern dem for et rent objekt.
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as Building;
}

/** Dedupliker og sortér: hovedbygninger (bolig/erhverv) før småbygninger, derefter nummer. */
export function normalizeBygninger(raw: RawBygning[]): Building[] {
  const seen = new Map<string, RawBygning>();
  for (const b of raw) if (isActiveBygning(b) && !seen.has(b.id_lokalId)) seen.set(b.id_lokalId, b);
  return [...seen.values()].map(normalizeBygning).sort((a, b) => {
    const sa = (a.anvendelseKode ?? 999) >= 900 ? 1 : 0;
    const sb = (b.anvendelseKode ?? 999) >= 900 ? 1 : 0;
    if (sa !== sb) return sa - sb;
    return (a.nummer ?? 9999) - (b.nummer ?? 9999);
  });
}

const collator: { compare: (a: string, b: string) => number } = (() => {
  try {
    return new Intl.Collator("da", { numeric: true, sensitivity: "base" });
  } catch {
    return { compare: (a: string, b: string) => a.localeCompare(b) };
  }
})();

/**
 * Adresser for ejendommen: beliggenhedsadressen fra EBR først, derefter
 * adgangsadresser (DAR-husnumre) på ejendommens jordstykker.
 */
export function normalizeAddresses(
  ebr: RawEjendomsbeliggenhed[],
  husnumre: RawHusnummer[],
): Address[] {
  const out: Address[] = [];
  const seenText = new Set<string>();
  const push = (id: string, text: string | null | undefined) => {
    const t = text?.trim();
    if (!t || seenText.has(t)) return;
    seenText.add(t);
    out.push({ id, text: t });
  };
  for (const e of ebr) push(e.adresseLokalId ?? e.husnummerLokalId ?? e.id_lokalId, e.betegnelse);
  const hn = husnumre
    .filter((h) => isActiveDar(h.status))
    .sort((a, b) => collator.compare(a.adgangsadressebetegnelse ?? "", b.adgangsadressebetegnelse ?? ""));
  for (const h of hn) push(h.id_lokalId, h.adgangsadressebetegnelse);
  return out;
}

/** Seneste vurdering med beløb. */
export function pickValuation(rows: RawVurdering[]): Valuation | undefined {
  const valid = rows
    .filter((r) => r.aar && (r.ejendomvaerdiBeloeb || r.grundvaerdiBeloeb))
    .sort((a, b) => Number(b.aar) - Number(a.aar) || b.id - a.id);
  const v = valid[0];
  if (!v) return undefined;
  return {
    aar: Number(v.aar),
    ejendomsvaerdi: Number(v.ejendomvaerdiBeloeb ?? 0),
    grundvaerdi: Number(v.grundvaerdiBeloeb ?? 0),
  };
}

/**
 * Til tileset: ældste opførelsesår og primær anvendelse (største bebyggede
 * areal). Garager, udhuse o.l. (9xx) bruges kun, hvis grunden intet andet har.
 */
export function summarizeForTiles(bygninger: RawBygning[]): { aar?: number; anv?: number } {
  const active = bygninger.filter(isActiveBygning);
  const hoved = active.filter((b) => (num(b.byg021BygningensAnvendelse) ?? 999) < 900);
  const basis = hoved.length ? hoved : active;
  const years = basis.map((b) => positive(b.byg026Opfoerelsesaar)).filter((n): n is number => !!n);
  const main = hoved.sort(
    (a, b) => (num(b.byg041BebyggetAreal) ?? 0) - (num(a.byg041BebyggetAreal) ?? 0),
  )[0];
  return {
    ...(years.length ? { aar: Math.min(...years) } : {}),
    ...(main ? { anv: num(main.byg021BygningensAnvendelse) } : {}),
  };
}
