import { describe, expect, it } from "vitest";
import {
  normalizeAddresses,
  normalizeBygning,
  normalizeBygninger,
  normalizeJordstykker,
  pickValuation,
  summarizeForTiles,
  summarizeMatrikel,
  type RawBygning,
} from "../src/server/datafordeler/normalize";

const bygning: RawBygning = {
  id_lokalId: "b1",
  status: "6",
  byg007Bygningsnummer: 1,
  byg021BygningensAnvendelse: "140",
  byg026Opfoerelsesaar: 1932,
  byg027OmTilbygningsaar: 0,
  byg032YdervaeggensMateriale: "1",
  byg033Tagdaekningsmateriale: "5",
  byg038SamletBygningsareal: 2400,
  byg039BygningensSamledeBoligAreal: 2200,
  byg040BygningensSamledeErhvervsAreal: 200,
  byg041BebyggetAreal: 480,
  byg054AntalEtager: 5,
  byg056Varmeinstallation: "1",
  byg057Opvarmningsmiddel: null,
};

describe("normalizeBygning", () => {
  it("oversætter BBR-koder til tekst", () => {
    const b = normalizeBygning(bygning);
    expect(b).toMatchObject({
      id: "b1",
      nummer: 1,
      anvendelseKode: 140,
      anvendelse: "Etageboligbebyggelse",
      opfoerelsesaar: 1932,
      bebyggetAreal: 480,
      samletBygningsareal: 2400,
      samletBoligareal: 2200,
      etager: 5,
      tag: "Tegl",
      ydervaeg: "Mursten",
      varmeinstallation: "Fjernvarme/blokvarme",
    });
    // 0 er "ikke oplyst" for om-/tilbygningsår, og null-felter udelades.
    expect(b).not.toHaveProperty("ombygningsaar");
    expect(b).not.toHaveProperty("opvarmningsmiddel");
  });

  it("viser ukendte koder som 'Kode n'", () => {
    expect(normalizeBygning({ id_lokalId: "x", byg033Tagdaekningsmateriale: "77" }).tag).toBe("Kode 77");
  });
});

describe("normalizeBygninger", () => {
  it("fjerner nedrevne/historiske, deduplikerer og sorterer småbygninger sidst", () => {
    const list = normalizeBygninger([
      { id_lokalId: "g", status: "6", byg021BygningensAnvendelse: "910", byg007Bygningsnummer: 1 },
      { id_lokalId: "h", status: "6", byg021BygningensAnvendelse: "120", byg007Bygningsnummer: 2 },
      { id_lokalId: "h", status: "6", byg021BygningensAnvendelse: "120", byg007Bygningsnummer: 2 },
      { id_lokalId: "old", status: "10", byg021BygningensAnvendelse: "120" },
      { id_lokalId: "err", status: "11", byg021BygningensAnvendelse: "120" },
    ]);
    expect(list.map((b) => b.id)).toEqual(["h", "g"]);
  });
});

describe("jordstykker og matrikel", () => {
  const js = normalizeJordstykker(
    [
      { id_lokalId: "j1", matrikelnummer: "12a", registreretAreal: 300, ejerlavLokalId: "e1", samletFastEjendomLokalId: "s", status: "Gældende" },
      { id_lokalId: "j2", matrikelnummer: "12b", registreretAreal: 900, ejerlavLokalId: "e1", samletFastEjendomLokalId: "s", status: "Gældende" },
      { id_lokalId: "j3", matrikelnummer: "12c", registreretAreal: 50, ejerlavLokalId: "e1", samletFastEjendomLokalId: "s", status: "Historisk" },
    ],
    [{ id_lokalId: "e1", ejerlavskode: 2000151, ejerlavsnavn: "Frederiksberg" }],
  );

  it("sorterer efter areal og slår ejerlav op", () => {
    expect(js.map((j) => j.id)).toEqual(["j2", "j1"]);
    expect(js[0]).toMatchObject({ ejerlav: "Frederiksberg", ejerlavskode: 2000151, areal: 900 });
  });

  it("summerer grundareal", () => {
    expect(summarizeMatrikel(js)).toEqual({
      matrikelnr: "12b, 12a",
      ejerlav: "Frederiksberg",
      grundareal: 1200,
    });
  });
});

describe("normalizeAddresses", () => {
  it("sætter beliggenhedsadressen først og sorterer naturligt", () => {
    const out = normalizeAddresses(
      [
        {
          id_lokalId: "e",
          bestemtFastEjendomBFENr: "1",
          husnummerLokalId: "h2",
          adresseLokalId: null,
          betegnelse: "Vej 2, 2000 Frederiksberg",
        },
      ],
      [
        { id_lokalId: "h10", adgangsadressebetegnelse: "Vej 10, 2000 Frederiksberg", status: "3" },
        { id_lokalId: "h2", adgangsadressebetegnelse: "Vej 2, 2000 Frederiksberg", status: "3" },
        { id_lokalId: "h4", adgangsadressebetegnelse: "Vej 4, 2000 Frederiksberg", status: "3" },
        { id_lokalId: "gone", adgangsadressebetegnelse: "Vej 6, 2000 Frederiksberg", status: "4" },
      ],
    );
    expect(out.map((a) => a.text)).toEqual([
      "Vej 2, 2000 Frederiksberg",
      "Vej 4, 2000 Frederiksberg",
      "Vej 10, 2000 Frederiksberg",
    ]);
  });
});

describe("pickValuation", () => {
  it("vælger seneste år med beløb", () => {
    expect(
      pickValuation([
        { id: 1, aar: 2020, ejendomvaerdiBeloeb: 3_000_000, grundvaerdiBeloeb: 1_000_000 },
        { id: 2, aar: 2022, ejendomvaerdiBeloeb: 3_600_000, grundvaerdiBeloeb: 1_200_000 },
        { id: 3, aar: 2024, ejendomvaerdiBeloeb: 0, grundvaerdiBeloeb: 0 },
      ]),
    ).toEqual({ aar: 2022, ejendomsvaerdi: 3_600_000, grundvaerdi: 1_200_000 });
  });

  it("returnerer undefined uden vurderinger", () => {
    expect(pickValuation([])).toBeUndefined();
  });
});

describe("summarizeForTiles", () => {
  it("giver ældste opførelsesår og anvendelse for største hovedbygning", () => {
    expect(
      summarizeForTiles([
        { id_lokalId: "a", status: "6", byg026Opfoerelsesaar: 1910, byg021BygningensAnvendelse: "930", byg041BebyggetAreal: 20 },
        { id_lokalId: "b", status: "6", byg026Opfoerelsesaar: 1935, byg021BygningensAnvendelse: "140", byg041BebyggetAreal: 500 },
        { id_lokalId: "c", status: "6", byg026Opfoerelsesaar: 1970, byg021BygningensAnvendelse: "321", byg041BebyggetAreal: 200 },
      ]),
    ).toEqual({ aar: 1935, anv: 140 });
  });
});
