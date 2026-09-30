// GraphQL-forespørgsler mod Datafordeleren. Feltnavne er translittererede
// (ø→oe, æ→ae, å→aa). Datafordeleren tillader kun ét rodfelt pr. forespørgsel
// og ingen aliaser. $vt/$rt er virknings- og registreringstid (bitemporalitet).

const PAGE = "pageInfo { hasNextPage endCursor }";

// --- MAT ---------------------------------------------------------------------

export const MAT_SFE_BY_BFE = `
query($bfe: Long!, $vt: DafDateTime!, $rt: DafDateTime!) {
  MAT_SamletFastEjendom(first: 1, virkningstid: $vt, registreringstid: $rt,
    where: { BFEnummer: { eq: $bfe } }) {
    nodes { id_lokalId BFEnummer status hovedejendomOpdeltIEjerlejligh geometri { wkt } }
  }
}`;

export const MAT_SFE_BY_IDS = `
query($ids: [String!], $vt: DafDateTime!, $rt: DafDateTime!, $after: String) {
  MAT_SamletFastEjendom(first: 100, after: $after, virkningstid: $vt, registreringstid: $rt,
    where: { id_lokalId: { in: $ids } }) {
    nodes { id_lokalId BFEnummer }
    ${PAGE}
  }
}`;

export const MAT_SFE_GEOM_BY_ID = `
query($id: String!, $vt: DafDateTime!, $rt: DafDateTime!) {
  MAT_SamletFastEjendom(first: 1, virkningstid: $vt, registreringstid: $rt,
    where: { id_lokalId: { eq: $id } }) {
    nodes { id_lokalId BFEnummer status hovedejendomOpdeltIEjerlejligh geometri { wkt } }
  }
}`;

export const MAT_EJERLEJLIGHED_BY_BFE = `
query($bfe: Long!, $vt: DafDateTime!, $rt: DafDateTime!) {
  MAT_Ejerlejlighed(first: 1, virkningstid: $vt, registreringstid: $rt,
    where: { BFEnummer: { eq: $bfe } }) {
    nodes { id_lokalId BFEnummer samletFastEjendomLokalId ejerlejlighedsnummer samletAreal }
  }
}`;

const JORDSTYKKE_FIELDS =
  "id_lokalId matrikelnummer registreretAreal ejerlavLokalId samletFastEjendomLokalId status";

export const MAT_JORDSTYKKER_BY_SFE = `
query($sfe: String!, $vt: DafDateTime!, $rt: DafDateTime!, $after: String) {
  MAT_Jordstykke(first: 100, after: $after, virkningstid: $vt, registreringstid: $rt,
    where: { samletFastEjendomLokalId: { eq: $sfe } }) {
    nodes { ${JORDSTYKKE_FIELDS} }
    ${PAGE}
  }
}`;

export const MAT_JORDSTYKKER_BY_IDS = `
query($ids: [String!], $vt: DafDateTime!, $rt: DafDateTime!, $after: String) {
  MAT_Jordstykke(first: 100, after: $after, virkningstid: $vt, registreringstid: $rt,
    where: { id_lokalId: { in: $ids } }) {
    nodes { ${JORDSTYKKE_FIELDS} }
    ${PAGE}
  }
}`;

export const MAT_EJERLAV_BY_IDS = `
query($ids: [String!], $vt: DafDateTime!, $rt: DafDateTime!) {
  MAT_Ejerlav(first: 100, virkningstid: $vt, registreringstid: $rt,
    where: { id_lokalId: { in: $ids } }) {
    nodes { id_lokalId ejerlavskode ejerlavsnavn }
  }
}`;

/** Jordstykkepolygoner i et udsnit (spatialt filter, EPSG:25832). */
export const MAT_LODFLADER_IN_AREA = `
query($wkt: String!, $vt: DafDateTime!, $rt: DafDateTime!, $after: String) {
  MAT_Lodflade(first: 1000, after: $after, virkningstid: $vt, registreringstid: $rt,
    where: { geometri: { intersects: { wkt: $wkt, crs: 25832 } } }) {
    nodes { id_lokalId jordstykkeLokalId status geometri { wkt } }
    ${PAGE}
  }
}`;

// --- BBR ---------------------------------------------------------------------

const BYGNING_FIELDS = `
  id_lokalId status grund jordstykke husnummer
  byg007Bygningsnummer byg021BygningensAnvendelse byg026Opfoerelsesaar byg027OmTilbygningsaar
  byg032YdervaeggensMateriale byg033Tagdaekningsmateriale
  byg038SamletBygningsareal byg039BygningensSamledeBoligAreal byg040BygningensSamledeErhvervsAreal
  byg041BebyggetAreal byg054AntalEtager byg056Varmeinstallation byg057Opvarmningsmiddel`;

export const BBR_BYGNINGER_BY_JORDSTYKKER = `
query($ids: [String!], $vt: DafDateTime!, $rt: DafDateTime!, $after: String) {
  BBR_Bygning(first: 500, after: $after, virkningstid: $vt, registreringstid: $rt,
    where: { jordstykke: { in: $ids } }) {
    nodes { ${BYGNING_FIELDS} }
    ${PAGE}
  }
}`;

export const BBR_BYGNINGER_BY_GRUNDE = `
query($ids: [String!], $vt: DafDateTime!, $rt: DafDateTime!, $after: String) {
  BBR_Bygning(first: 500, after: $after, virkningstid: $vt, registreringstid: $rt,
    where: { grund: { in: $ids } }) {
    nodes { ${BYGNING_FIELDS} }
    ${PAGE}
  }
}`;

export const BBR_GRUNDJORDSTYKKER = `
query($ids: [String!], $vt: DafDateTime!, $rt: DafDateTime!, $after: String) {
  BBR_GrundJordstykke(first: 500, after: $after, virkningstid: $vt, registreringstid: $rt,
    where: { jordstykke: { in: $ids } }) {
    nodes { grund jordstykke }
    ${PAGE}
  }
}`;

/** Til tileset-pipelinen: bygninger i et område (spatialt filter på bygningspunktet). */
export const BBR_BYGNINGER_IN_AREA = `
query($wkt: String!, $vt: DafDateTime!, $rt: DafDateTime!, $after: String) {
  BBR_Bygning(first: 1000, after: $after, virkningstid: $vt, registreringstid: $rt,
    where: { byg404Koordinat: { intersects: { wkt: $wkt, crs: 25832 } } }) {
    nodes { id_lokalId status jordstykke grund byg021BygningensAnvendelse byg026Opfoerelsesaar byg041BebyggetAreal }
    ${PAGE}
  }
}`;

export const BBR_GRUNDJORDSTYKKER_BY_GRUNDE = `
query($ids: [String!], $vt: DafDateTime!, $rt: DafDateTime!, $after: String) {
  BBR_GrundJordstykke(first: 500, after: $after, virkningstid: $vt, registreringstid: $rt,
    where: { grund: { in: $ids } }) {
    nodes { grund jordstykke }
    ${PAGE}
  }
}`;

// --- DAR / EBR ---------------------------------------------------------------

export const DAR_HUSNUMRE_BY_JORDSTYKKER = `
query($ids: [String!], $vt: DafDateTime!, $rt: DafDateTime!, $after: String) {
  DAR_Husnummer(first: 500, after: $after, virkningstid: $vt, registreringstid: $rt,
    where: { jordstykke: { in: $ids } }) {
    nodes { id_lokalId adgangsadressebetegnelse husnummertekst status jordstykke adgangspunkt }
    ${PAGE}
  }
}`;

export const DAR_HUSNUMMER_BY_ID = `
query($id: String!, $vt: DafDateTime!, $rt: DafDateTime!) {
  DAR_Husnummer(first: 1, virkningstid: $vt, registreringstid: $rt,
    where: { id_lokalId: { eq: $id } }) {
    nodes { id_lokalId adgangsadressebetegnelse status jordstykke adgangspunkt }
  }
}`;

export const DAR_HUSNUMRE_STARTS_WITH = `
query($q: String!, $vt: DafDateTime!, $rt: DafDateTime!) {
  DAR_Husnummer(first: 10, virkningstid: $vt, registreringstid: $rt,
    where: { adgangsadressebetegnelse: { startsWith: $q } }) {
    nodes { id_lokalId adgangsadressebetegnelse status }
  }
}`;

export const DAR_ADRESSEPUNKT_BY_ID = `
query($id: String!, $vt: DafDateTime!, $rt: DafDateTime!) {
  DAR_Adressepunkt(first: 1, virkningstid: $vt, registreringstid: $rt,
    where: { id_lokalId: { eq: $id } }) {
    nodes { id_lokalId position { wkt } }
  }
}`;

export const EBR_BY_BFE = `
query($bfe: String!, $vt: DafDateTime!, $rt: DafDateTime!) {
  EBR_Ejendomsbeliggenhed(first: 100, virkningstid: $vt, registreringstid: $rt,
    where: { bestemtFastEjendomBFENr: { eq: $bfe } }) {
    nodes { id_lokalId bestemtFastEjendomBFENr husnummerLokalId adresseLokalId betegnelse status }
  }
}`;

export const EBR_BY_HUSNUMMER = `
query($id: String!, $vt: DafDateTime!, $rt: DafDateTime!) {
  EBR_Ejendomsbeliggenhed(first: 100, virkningstid: $vt, registreringstid: $rt,
    where: { husnummerLokalId: { eq: $id } }) {
    nodes { id_lokalId bestemtFastEjendomBFENr husnummerLokalId adresseLokalId betegnelse status }
  }
}`;

// --- VUR (ingen bitemporale argumenter) ----------------------------------------

export const VUR_KRYDSREF_BY_BFE = `
query($bfe: Long!) {
  VUR_BFEKrydsreference(first: 100, where: { BFEnummer: { eq: $bfe } }) {
    nodes { BFEnummer fkEjendomsvurderingID }
  }
}`;

export const VUR_KRYDSREF_BY_BFES = `
query($bfes: [Long!], $after: String) {
  VUR_BFEKrydsreference(first: 1000, after: $after, where: { BFEnummer: { in: $bfes } }) {
    nodes { BFEnummer fkEjendomsvurderingID }
    ${PAGE}
  }
}`;

export const VUR_VURDERINGER_BY_IDS = `
query($ids: [Long!], $after: String) {
  VUR_Ejendomsvurdering(first: 100, after: $after, where: { id: { in: $ids } }) {
    nodes { id aar ejendomvaerdiBeloeb grundvaerdiBeloeb vurderetAreal }
    ${PAGE}
  }
}`;
