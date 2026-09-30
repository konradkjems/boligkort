// Normaliserede typer, som resten af appen bruger. Datafordelerens rå
// GraphQL-svar oversættes til disse i src/server/datafordeler/normalize.ts,
// så et skifte i Datafordelerens skema kun rammer ét modul.

export type Matrikel = {
  matrikelnr: string;
  ejerlav: string;
  grundareal: number;
};

export type Jordstykke = {
  id: string;
  matrikelnr: string;
  ejerlav: string;
  ejerlavskode?: number;
  areal: number;
};

export type Address = {
  id: string;
  text: string;
};

export type Building = {
  id: string;
  nummer?: number;
  anvendelseKode?: number;
  anvendelse?: string;
  opfoerelsesaar?: number;
  ombygningsaar?: number;
  bebyggetAreal?: number;
  samletBygningsareal?: number;
  samletBoligareal?: number;
  samletErhvervsareal?: number;
  etager?: number;
  tag?: string;
  ydervaeg?: string;
  varmeinstallation?: string;
  opvarmningsmiddel?: string;
};

export type Valuation = {
  aar: number;
  ejendomsvaerdi: number;
  grundvaerdi: number;
};

export type Registry = "MAT" | "EBR" | "DAR" | "BBR" | "VUR";

export type PropertyCard = {
  bfe: number;
  matrikel: Matrikel;
  jordstykker?: Jordstykke[];
  addresses: Address[];
  buildings: Building[];
  valuation?: Valuation;
  /** Repræsentativt punkt (WGS84) til at flyve kortet hen til ejendommen. */
  center?: { lng: number; lat: number };
  /** [minLng, minLat, maxLng, maxLat] for alle jordstykker. */
  bbox?: [number, number, number, number];
  fetchedAt: number;
  /** Registre, der fejlede ved seneste opslag. */
  sourceErrors: string[];
};

export type AddressSuggestion = {
  /** DAR-husnummer-id (kind "adresse") eller søgetekst til videre forfining (kind "vej"). */
  id: string;
  text: string;
  kind: "adresse" | "vej";
};

export type ResolvedAddress = {
  id: string;
  text: string;
  bfe?: number;
  lng: number;
  lat: number;
};

export type AddressApi = {
  search: (q: string) => Promise<AddressSuggestion[]>;
  resolve: (id: string) => Promise<ResolvedAddress>;
};
