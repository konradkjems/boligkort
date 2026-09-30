// En lille falsk Datafordeler til tests: svarer ud fra rodfeltet i forespørgslen.

type Handler = (vars: Record<string, unknown>, url: URL) => unknown;

export function fakeDatafordeler(handlers: Record<string, Handler>, opts: { failRegisters?: string[] } = {}) {
  const calls: { root: string; url: URL; vars: Record<string, unknown> }[] = [];
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const register = url.pathname.split("/")[1];
    const body = JSON.parse(String(init?.body ?? "{}"));
    const root = String(body.query).match(/\{\s*([A-Z]+_[A-Za-z]+)\s*\(/)?.[1] ?? "?";
    calls.push({ root, url, vars: body.variables });
    if (opts.failRegisters?.includes(register)) {
      return new Response("boom", { status: 500 });
    }
    const h = handlers[root];
    if (!h) return Response.json({ errors: [{ message: `no handler for ${root}` }] });
    return Response.json({ data: { [root]: { nodes: h(body.variables, url), pageInfo: { hasNextPage: false, endCursor: null } } } });
  };
  return { impl: impl as typeof fetch, calls };
}

export const SFE_WKT =
  "MULTIPOLYGON(((720500 6177000,720540 6177000,720540 6177030,720500 6177030,720500 6177000)))";

export const standardHandlers: Record<string, Handler> = {
  MAT_SamletFastEjendom: (v) =>
    v.bfe === 100165718
      ? [{ id_lokalId: "sfe-1", BFEnummer: 100165718, status: "Gældende", geometri: { wkt: SFE_WKT } }]
      : [],
  MAT_Ejerlejlighed: () => [],
  MAT_Jordstykke: () => [
    { id_lokalId: "1538971", matrikelnummer: "25b", registreretAreal: 1210, ejerlavLokalId: "ej-1", samletFastEjendomLokalId: "sfe-1", status: "Gældende" },
  ],
  MAT_Ejerlav: () => [{ id_lokalId: "ej-1", ejerlavskode: 2000151, ejerlavsnavn: "Frederiksberg" }],
  BBR_Bygning: (v) =>
    Array.isArray(v.ids) && (v.ids as string[]).includes("1538971")
      ? [
          { id_lokalId: "byg-1", status: "6", byg007Bygningsnummer: 1, byg021BygningensAnvendelse: "120", byg026Opfoerelsesaar: 1928, byg041BebyggetAreal: 110, byg038SamletBygningsareal: 180, byg039BygningensSamledeBoligAreal: 180, byg054AntalEtager: 2, byg033Tagdaekningsmateriale: "5", byg032YdervaeggensMateriale: "1", byg056Varmeinstallation: "1" },
          { id_lokalId: "byg-2", status: "6", byg007Bygningsnummer: 2, byg021BygningensAnvendelse: "910", byg026Opfoerelsesaar: 1960, byg041BebyggetAreal: 18 },
        ]
      : [{ id_lokalId: "byg-1", status: "6", byg007Bygningsnummer: 1, byg021BygningensAnvendelse: "120" }],
  BBR_GrundJordstykke: () => [{ grund: "grund-1", jordstykke: "1538971" }],
  DAR_Husnummer: () => [
    { id_lokalId: "hn-1", adgangsadressebetegnelse: "Testvej 3, 2000 Frederiksberg", status: "3", jordstykke: "1538971", adgangspunkt: "ap-1" },
  ],
  EBR_Ejendomsbeliggenhed: () => [
    { id_lokalId: "ebr-1", bestemtFastEjendomBFENr: "100165718", husnummerLokalId: "hn-1", adresseLokalId: null, betegnelse: "Testvej 3, 2000 Frederiksberg" },
  ],
  VUR_BFEKrydsreference: () => [{ BFEnummer: 100165718, fkEjendomsvurderingID: 11 }, { BFEnummer: 100165718, fkEjendomsvurderingID: 12 }],
  VUR_Ejendomsvurdering: () => [
    { id: 11, aar: 2020, ejendomvaerdiBeloeb: 5_100_000, grundvaerdiBeloeb: 2_000_000 },
    { id: 12, aar: 2022, ejendomvaerdiBeloeb: 6_400_000, grundvaerdiBeloeb: 2_550_000 },
  ],
  DAR_Adressepunkt: () => [{ id_lokalId: "ap-1", position: { wkt: "POINT(720520 6177015)" } }],
};
