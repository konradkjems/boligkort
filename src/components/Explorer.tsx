"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ColorDimension } from "@/lib/colorize";
import { PARCEL_FALLBACK_MIN_ZOOM, PARCEL_MIN_ZOOM, publicConfig } from "@/lib/config";
import { useAddressSearch, usePropertyCard } from "@/lib/data";
import { parseBfe } from "@/lib/format";
import type { AddressSuggestion } from "@/lib/types";
import Legend from "./Legend";
import MapControls from "./MapControls";
import type { BaseStyle, MapFocus, ParcelHit } from "./MapView";
import SearchBox from "./SearchBox";
import Sidebar from "./Sidebar";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-slate-200" />,
});

type Selection = { bfe: number; mnr?: string };

const minParcelZoom = publicConfig.tilesetId ? PARCEL_MIN_ZOOM : PARCEL_FALLBACK_MIN_ZOOM;

export default function Explorer({ initialBfe }: { initialBfe: number | null }) {
  const [selection, setSelection] = useState<Selection | null>(
    initialBfe ? { bfe: initialBfe } : null,
  );
  // BFE, som kortet skal flyve hen til, når data er hentet (valgt via URL).
  const pendingFly = useRef<number | null>(initialBfe);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [baseStyle, setBaseStyle] = useState<BaseStyle>("streets");
  const [dimension, setDimension] = useState<ColorDimension>("aar");
  const [show3d, setShow3d] = useState(false);
  const [zoom, setZoom] = useState(publicConfig.initialView.zoom);
  const [legendOpen, setLegendOpen] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const focusKey = useRef(0);

  const property = usePropertyCard(selection?.bfe ?? null);
  const addressApi = useAddressSearch();

  const flyTo = useCallback((f: Omit<MapFocus, "key">) => {
    setFocus({ ...f, key: ++focusKey.current });
  }, []);

  // URL afspejler valgt ejendom (F9).
  const select = useCallback((sel: Selection | null) => {
    pendingFly.current = null;
    setSelection(sel);
    const path = sel ? `/e/${sel.bfe}` : "/";
    if (window.location.pathname !== path) window.history.pushState(null, "", path);
  }, []);

  useEffect(() => {
    const onPop = () => {
      const m = window.location.pathname.match(/^\/e\/(\d+)/);
      const bfe = parseBfe(m?.[1]);
      pendingFly.current = bfe;
      setSelection(bfe ? { bfe } : null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Når en ejendom er valgt via URL eller søgning, flyver vi derhen, når data er klar.
  const card = property.card;
  useEffect(() => {
    if (!card || pendingFly.current !== card.bfe) return;
    pendingFly.current = null;
    if (card.bbox || card.center) flyTo({ bbox: card.bbox, center: card.center });
  }, [card, flyTo]);

  useEffect(() => {
    const t = card?.addresses[0]?.text ?? (selection ? `BFE ${selection.bfe}` : null);
    document.title = t ? `${t} · Ejendomskort` : "Ejendomskort";
  }, [card, selection]);

  const onParcel = useCallback(
    (hit: ParcelHit) => {
      if (!hit.bfe) return;
      select({ bfe: hit.bfe, mnr: hit.mnr });
    },
    [select],
  );

  const [notice, setNotice] = useState<string | null>(null);
  const onPick = useCallback(
    async (s: AddressSuggestion) => {
      setNotice(null);
      try {
        const r = await addressApi.resolve(s.id);
        flyTo({ center: { lng: r.lng, lat: r.lat } });
        if (r.bfe) select({ bfe: r.bfe });
        else setNotice("Adressen er fundet, men der er ingen ejendom tilknyttet.");
      } catch (err) {
        setNotice((err as Error).message || "Adressen kunne ikke slås op.");
      }
    },
    [addressApi, flyTo, select],
  );

  if (!publicConfig.mapboxToken) return <SetupNotice />;

  const panelPadding = selection
    ? isDesktop
      ? { left: 416, bottom: 0 }
      : { left: 0, bottom: typeof window === "undefined" ? 0 : Math.round(window.innerHeight * 0.62) }
    : { left: 0, bottom: 0 };

  return (
    <main className="fixed inset-0 overflow-hidden bg-slate-200">
      <MapView
        baseStyle={baseStyle}
        dimension={dimension}
        show3d={show3d}
        selectedBfe={selection?.bfe ?? null}
        focus={focus}
        panelPadding={panelPadding}
        onSelect={onParcel}
        onZoomChange={setZoom}
        onError={(m) => setMapError(m)}
      />

      {/* Venstre kolonne: søgning + sidepanel */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-col gap-2 md:inset-x-auto md:bottom-4 md:left-4 md:w-[400px]">
        <div className="pointer-events-auto flex items-center gap-2">
          <SearchBox search={addressApi.search} onPick={onPick} />
        </div>
        {notice && (
          <div className="panel pointer-events-auto flex items-start gap-2 px-3 py-2 text-sm text-slate-700">
            <span className="flex-1">{notice}</span>
            <button className="text-slate-400 hover:text-slate-700" onClick={() => setNotice(null)} aria-label="Luk">
              ×
            </button>
          </div>
        )}
        {selection && isDesktop && (
          <div className="flex min-h-0 flex-1 items-start">
            <Sidebar
              bfe={selection.bfe}
              hintMnr={selection.mnr}
              state={property}
              onClose={() => select(null)}
            />
          </div>
        )}
      </div>

      {/* Mobil: sidepanel som bottom sheet */}
      {selection && !isDesktop && (
        <div className="pointer-events-none absolute inset-x-2 bottom-2 z-20 flex max-h-[62vh]">
          <Sidebar
            bfe={selection.bfe}
            hintMnr={selection.mnr}
            state={property}
            onClose={() => select(null)}
          />
        </div>
      )}

      <div className="absolute right-3 top-16 z-10 flex flex-col items-end gap-2 md:top-3">
        <MapControls
          baseStyle={baseStyle}
          onBaseStyle={setBaseStyle}
          show3d={show3d}
          onShow3d={setShow3d}
        />
        {zoom < minParcelZoom && (
          <div className="panel px-3 py-1.5 text-xs text-slate-700">
            Zoom ind for at se matrikler
          </div>
        )}
        {mapError && /token|401|403/i.test(mapError) && (
          <div className="panel max-w-64 px-3 py-2 text-xs text-red-800">
            Kortet kunne ikke indlæses: {mapError}
          </div>
        )}
        {isDesktop && (
          <Legend
            dimension={dimension}
            onChange={setDimension}
            note={
              publicConfig.tilesetId
                ? undefined
                : "Farvelægning kræver det forbehandlede matrikel-tileset."
            }
          />
        )}
      </div>

      {!isDesktop && !selection && (
        <div className="absolute bottom-8 left-3 z-10">
          {legendOpen ? (
            <div className="relative">
              <Legend dimension={dimension} onChange={setDimension} />
              <button
                className="absolute right-2 top-2 text-xs text-slate-500"
                onClick={() => setLegendOpen(false)}
                aria-label="Skjul farvelægning"
              >
                Skjul
              </button>
            </div>
          ) : (
            <button className="panel px-3 py-2 text-xs font-medium" onClick={() => setLegendOpen(true)}>
              Farvelæg
            </button>
          )}
        </div>
      )}
    </main>
  );
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return matches;
}

function SetupNotice() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="panel max-w-lg p-6 text-sm text-slate-700">
        <h1 className="mb-2 text-lg font-semibold text-slate-900">Ejendomskort mangler konfiguration</h1>
        <p>
          Sæt miljøvariablen <code className="rounded bg-slate-100 px-1">NEXT_PUBLIC_MAPBOX_TOKEN</code>{" "}
          til et Mapbox public token og byg appen igen. Se README for de øvrige variabler
          (Datafordeler og Convex).
        </p>
      </div>
    </main>
  );
}
