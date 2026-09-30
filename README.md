# Ejendomskort

Interaktivt Danmarkskort: klik på en matrikel og se samlet ejendomsdata fra
Datafordeleren (MAT, BBR, DAR/EBR og VUR) i et sidepanel. Bygget på Next.js,
Mapbox GL JS og Convex efter PRD'en "Ejendomskort MVP".

## Funktioner (PRD-krav)

| ID | Krav | Hvor |
| --- | --- | --- |
| F1 | Fuldskærmskort med skift mellem vejkort og luftfoto | `src/components/MapView.tsx`, `MapControls.tsx` |
| F2 | Matrikellag (jordstykker) fra MTS-tileset, synligt fra zoom 14 | `MapView.tsx`, `scripts/build-tileset.ts` |
| F3 | Hover-highlight via feature-state | `MapView.tsx` |
| F4 | Klik vælger jordstykke og åbner sidepanel | `MapView.tsx`, `Explorer.tsx` |
| F5 | Adresse(r), matrikelnr., ejerlav og grundareal | `Sidebar.tsx` |
| F6 | BBR-bygninger: anvendelse, opførelsesår, arealer, etager, tag, ydervæg, varme | `Sidebar.tsx`, `src/server/datafordeler/normalize.ts` |
| F7 | Seneste ejendoms- og grundværdi fra VUR | `Sidebar.tsx` |
| F8 | Adressesøgning med autocomplete, der flyver til ejendommen | `SearchBox.tsx`, `src/server/datafordeler/search.ts` |
| F9 | Valgt ejendom i URL (`/e/{bfe}`) | `src/app/[[...path]]/page.tsx`, `Explorer.tsx` |
| F10/F11 | Farvelægning efter byggeår, anvendelse eller værdi/m² med legend | `src/lib/colorize.ts`, `Legend.tsx` |
| F12 | 3D-bygninger ved høj zoom | `MapView.tsx` |

Sidepanelet har tilstandene loading (skeleton), data, delvise data (et register
fejlede, resten vises) og fejl med genforsøg.

## Arkitektur

```
Browser (Next.js + Mapbox GL JS)
  │  klik giver jid + bfe direkte fra tilen
  ├─► Mapbox: basiskort + matrikel-tileset (MTS)
  └─► Convex
        getProperty(bfe)       query: cache pr. BFE (7 dage)
        refreshProperty(bfe)   action: MAT, EBR, DAR, BBR, VUR parallelt
        searchAddresses(q)     action: Adressevælger (fallback: DAR-præfiks)
        resolveAddress(id)     action: DAR + EBR → koordinat + BFE
              │
              ▼
        src/server/datafordeler/*  (eneste modul, der taler med Datafordeleren)
              │  GraphQL, OAuth client credentials eller API-nøgle
              ▼
        graphql.datafordeler.dk/{MAT/v2, BBR/v3, DAR/v3, EBR/v1, VUR/v2}

GitHub Actions (natligt) → scripts/build-tileset.ts → Mapbox Tiling Service
```

- **Kun Datafordelerens nye GraphQL.** Ingen DAWA og ingen gamle
  webbruger/tjenestebruger-kald. Alle bitemporale forespørgsler sender
  `virkningstid` og `registreringstid` = nu, så kun aktuelle versioner vises.
- **Reprojektion.** Datafordeleren leverer EPSG:25832. `geo.ts` reprojicerer
  til WGS84 med proj4.
- **Cache.** Convex gemmer ejendomskortet pr. BFE i 7 dage. Delvise svar
  (et register fejlede) forsøges igen efter 5 minutter. Alle opslag logges i
  `lookups` til monitorering af rate limits.
- **Uden Convex.** Er `NEXT_PUBLIC_CONVEX_URL` ikke sat, bruger klienten
  Next.js route handlers (`/api/property/[bfe]`, `/api/search`,
  `/api/address/[id]`), og Vercels CDN cacher svarene. Samme servermodul.
- **Uden tileset.** Er `NEXT_PUBLIC_MAPBOX_TILESET_ID` ikke sat, hentes
  jordstykker som GeoJSON fra `/api/jordstykker` (MAT_Lodflade med spatialt
  filter) fra zoom 16. Farvelægning kræver tilesettet, da `aar`, `anv` og
  `vm2` beregnes i pipelinen.

### Kobling mellem registre

| Data | Forespørgsel |
| --- | --- |
| Matrikel | `MAT_SamletFastEjendom(BFEnummer)` → `MAT_Jordstykke(samletFastEjendomLokalId)` → `MAT_Ejerlav` |
| Ejerlejlighed | `MAT_Ejerlejlighed(BFEnummer)` → hovedejendommens samlede faste ejendom |
| Bygninger | `BBR_Bygning(jordstykke in …)` + `BBR_GrundJordstykke` → `BBR_Bygning(grund in …)` |
| Adresser | `EBR_Ejendomsbeliggenhed(bestemtFastEjendomBFENr)` + `DAR_Husnummer(jordstykke in …)` |
| Vurdering | `VUR_BFEKrydsreference(BFEnummer)` → `VUR_Ejendomsvurdering(id in …)`, seneste år |
| Søgning | Adressevælger `husnumre/soeg` → `DAR_Husnummer` + `DAR_Adressepunkt` + `EBR` |

## Kom i gang lokalt

```bash
npm install
cp .env.example .env.local        # udfyld mindst NEXT_PUBLIC_MAPBOX_TOKEN og Datafordeler
npx convex dev                     # opretter Convex-projekt, skriver NEXT_PUBLIC_CONVEX_URL
npx convex env set DATAFORDELER_CLIENT_ID ...      # eller DATAFORDELER_API_KEY
npx convex env set DATAFORDELER_CLIENT_SECRET ...
npm run dev                        # http://localhost:3000
```

Tjek: `npm run check` (lint, typecheck inkl. Convex, tests).

### Credentials

- **Datafordeleren:** log ind på administration.datafordeler.dk, opret et
  IT-system og lav en OAuth Shared Secret (client id + secret) eller en
  API-nøgle. Lad IP-allowlisten være tom: den er ikke påkrævet for
  ikke-beskyttede data, og Convex/Vercel har skiftende IP'er.
- **Mapbox:** et public token (`pk.*`) URL-begrænset til jeres domæner, og til
  pipelinen et secret token med `tilesets:write`, `tilesets:read` og
  `tilesets:list`.
- **Adressevælger:** anmod om et token hos support@kds.dk. Uden token bruges
  det offentlige demo-token.

## Deploy på Vercel

1. Importér GitHub-repoet i Vercel (framework: Next.js). `vercel.json` sætter
   build-kommandoen til `npm run vercel-build`.
2. Sæt miljøvariabler i Vercel (Production og Preview):
   - `NEXT_PUBLIC_MAPBOX_TOKEN`
   - `CONVEX_DEPLOY_KEY` (Convex dashboard → Settings → Deploy keys → Production)
   - `NEXT_PUBLIC_MAPBOX_TILESET_ID` og `NEXT_PUBLIC_MAPBOX_TILESET_LAYER`, når tilesettet er bygget
   - `DATAFORDELER_CLIENT_ID`/`DATAFORDELER_CLIENT_SECRET` (eller `DATAFORDELER_API_KEY`) og
     `ADRESSEVAELGER_TOKEN`, hvis REST-fallbacken eller `/api/jordstykker` bruges
3. Sæt Datafordeler-variablerne i Convex-produktionsdeploymentet:
   `npx convex env set --prod DATAFORDELER_CLIENT_ID ...` osv.
4. Deploy. Med `CONVEX_DEPLOY_KEY` deployes Convex-funktionerne først, og
   `NEXT_PUBLIC_CONVEX_URL` sættes automatisk. Uden nøglen kører appen på
   REST-fallbacken.

## Tileset-pipeline

```bash
npm run tileset:dry   # skriver data/jordstykker.ldgeojson
npm run tileset       # + upload og publish til Mapbox Tiling Service
```

Pipelinen deler pilotområdet (`PILOT_BBOX`, standard Frederiksberg) i celler,
henter `MAT_Lodflade` spatialt, påfører matrikelnr. og BFE, beregner ældste
opførelsesår og primær anvendelse fra BBR og værdi/m² fra VUR, og publicerer
laget `jordstykker` (minzoom 14) til MTS. Workflowet
`.github/workflows/tileset.yml` kører natligt, når secrets
`DATAFORDELER_*` og `MAPBOX_SECRET_TOKEN` samt variablen `MAPBOX_USERNAME`
er sat.

Tileset-properties: `jid`, `bfe`, `mnr`, `aar`, `anv`, `vm2`.

## Kendte forbehold

- Datafordelerens schemaversioner kan skifte. En tilbagetrukket version svarer
  HTTP 404. Versioner kan overstyres med `DATAFORDELER_VERSIONS` uden deploy
  af ny kode.
- Adressevælgerens demo-token udløber ultimo 2026. Sæt `ADRESSEVAELGER_TOKEN`.
- 3D-bygninger bruger Mapbox' egne bygningshøjder fra basiskortet, ikke
  GeoDanmark.
- Kilden vises i appen: "Indeholder data fra Datafordeleren".
