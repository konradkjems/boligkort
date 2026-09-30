"use client";

import mapboxgl, {
  type GeoJSONSource,
  type LngLatBoundsLike,
  type Map as MapboxMap,
  type MapMouseEvent,
} from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState } from "react";
import { fillColorExpression, type ColorDimension } from "@/lib/colorize";
import {
  PARCEL_FALLBACK_MIN_ZOOM,
  PARCEL_MIN_ZOOM,
  publicConfig,
} from "@/lib/config";

export type BaseStyle = "streets" | "satellite";

export type ParcelHit = {
  jid: string;
  bfe?: number;
  mnr?: string;
  lng: number;
  lat: number;
};

export type MapFocus = {
  key: number;
  center?: { lng: number; lat: number };
  bbox?: [number, number, number, number];
};

type Props = {
  baseStyle: BaseStyle;
  dimension: ColorDimension;
  show3d: boolean;
  selectedBfe: number | null;
  focus: MapFocus | null;
  /** Padding for den del af kortet, som sidepanelet dækker (venstre på desktop, bund på mobil). */
  panelPadding: { left: number; bottom: number };
  onSelect: (hit: ParcelHit) => void;
  onZoomChange?: (zoom: number) => void;
  onError?: (message: string) => void;
};

const STYLE_URLS: Record<BaseStyle, string> = {
  streets: "mapbox://styles/mapbox/streets-v12",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
};

const SRC = "parcels";
const FILL = "parcels-fill";
const LINE = "parcels-line";
const HOVER = "parcels-hover";
const SELECTED = "parcels-selected";
const BUILDINGS = "buildings-3d";

const useTileset = Boolean(publicConfig.tilesetId);
const sourceLayer = useTileset ? publicConfig.tilesetLayer : undefined;

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export default function MapView(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const propsRef = useRef(props);
  const [styleReady, setStyleReady] = useState(0);

  useEffect(() => {
    propsRef.current = props;
  });

  // Opret kortet én gang.
  useEffect(() => {
    if (!container.current) return;
    mapboxgl.accessToken = publicConfig.mapboxToken;
    const { lng, lat, zoom } = publicConfig.initialView;
    const map = new mapboxgl.Map({
      container: container.current,
      style: STYLE_URLS[propsRef.current.baseStyle],
      center: [lng, lat],
      zoom,
      maxPitch: 70,
      language: "da",
      logoPosition: "bottom-right",
      customAttribution:
        'Indeholder data fra <a href="https://datafordeler.dk" target="_blank" rel="noreferrer">Datafordeleren</a>',
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "bottom-right");
    map.addControl(
      new mapboxgl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }),
      "bottom-right",
    );
    map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-right");

    map.on("style.load", () => {
      addParcelLayers(map, propsRef.current);
      setStyleReady((n) => n + 1);
    });
    map.on("error", (e) => {
      const msg = e.error?.message ?? "Ukendt kortfejl";
      console.warn("[map]", msg);
      propsRef.current.onError?.(msg);
    });
    map.on("zoomend", () => propsRef.current.onZoomChange?.(map.getZoom()));

    // Hover via feature-state (F3).
    let hoveredId: string | number | undefined;
    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: "parcel-tooltip",
    });
    const clearHover = () => {
      if (hoveredId !== undefined && map.getSource(SRC)) {
        map.setFeatureState({ source: SRC, sourceLayer, id: hoveredId }, { hover: false });
      }
      hoveredId = undefined;
      popup.remove();
      map.getCanvas().style.cursor = "";
    };
    map.on("mousemove", FILL, (e) => {
      const f = e.features?.[0];
      if (!f || f.id === undefined) return;
      if (f.id !== hoveredId) {
        clearHover();
        hoveredId = f.id;
        map.setFeatureState({ source: SRC, sourceLayer, id: hoveredId }, { hover: true });
      }
      map.getCanvas().style.cursor = "pointer";
      const mnr = f.properties?.mnr;
      if (mnr && !("ontouchstart" in window)) {
        popup.setLngLat(e.lngLat).setText(`Matr.nr. ${mnr}`).addTo(map);
      }
    });
    map.on("mouseleave", FILL, clearHover);

    // Klik vælger jordstykke (F4).
    map.on("click", (e: MapMouseEvent) => {
      if (!map.getLayer(FILL)) return;
      const f = map.queryRenderedFeatures(e.point, { layers: [FILL] })[0];
      if (!f) return;
      const p = f.properties ?? {};
      const bfe = Number(p.bfe);
      propsRef.current.onSelect({
        jid: String(p.jid ?? f.id),
        bfe: Number.isFinite(bfe) && bfe > 0 ? bfe : undefined,
        mnr: p.mnr ? String(p.mnr) : undefined,
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
      });
    });

    // Fallback: hent jordstykker som GeoJSON for det synlige udsnit.
    let cleanupFallback = () => {};
    if (!useTileset) cleanupFallback = attachGeoJsonFallback(map);

    return () => {
      cleanupFallback();
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Skift mellem vejkort og luftfoto (F1).
  const firstStyle = useRef(true);
  useEffect(() => {
    if (firstStyle.current) {
      firstStyle.current = false;
      return;
    }
    // diff: false sikrer et fuldt style.load, så matrikellagene tilføjes igen.
    mapRef.current?.setStyle(STYLE_URLS[props.baseStyle], { diff: false } as Parameters<
      MapboxMap["setStyle"]
    >[1]);
  }, [props.baseStyle]);

  // Farvelægning (F10/F11).
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer(FILL)) return;
    map.setPaintProperty(FILL, "fill-color", fillColorExpression(props.dimension) as never);
    map.setPaintProperty(FILL, "fill-opacity", fillOpacity(props.dimension) as never);
  }, [props.dimension, styleReady]);

  // Valgt ejendom markeres via filter på BFE, så alle jordstykker i ejendommen fremhæves.
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer(SELECTED)) return;
    map.setFilter(SELECTED, ["==", ["to-number", ["get", "bfe"], -1], props.selectedBfe ?? -2]);
  }, [props.selectedBfe, styleReady]);

  // 3D-bygninger (F12).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (props.show3d) {
      add3dBuildings(map);
      if (map.getPitch() < 30) map.easeTo({ pitch: 55, duration: 800 });
    } else {
      if (map.getLayer(BUILDINGS)) map.removeLayer(BUILDINGS);
      if (map.getPitch() > 0) map.easeTo({ pitch: 0, duration: 800 });
    }
  }, [props.show3d, styleReady]);

  // Flyv til ejendom (F8/F9).
  useEffect(() => {
    const map = mapRef.current;
    const f = props.focus;
    if (!map || !f) return;
    const { left, bottom } = props.panelPadding;
    const padding = { top: 80, bottom: 40 + bottom, left: 40 + left, right: 40 };
    if (f.bbox) {
      map.fitBounds(f.bbox as LngLatBoundsLike, { padding, maxZoom: 18, duration: 1200 });
    } else if (f.center) {
      map.flyTo({
        center: [f.center.lng, f.center.lat],
        zoom: Math.max(map.getZoom(), 17.5),
        padding,
        duration: 1200,
      });
    }
    // panelPadding læses bevidst kun ved nyt fokus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focus?.key]);

  // mapbox-gl.css sætter position: relative på containeren, så den ligger i en wrapper.
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" aria-label="Danmarkskort" />
    </div>
  );
}

function fillOpacity(dim: ColorDimension): unknown[] {
  const base = dim === "none" ? 0.04 : 0.55;
  return [
    "case",
    ["boolean", ["feature-state", "hover"], false],
    dim === "none" ? 0.25 : 0.8,
    base,
  ];
}

function addParcelLayers(map: MapboxMap, p: Props) {
  const satellite = p.baseStyle === "satellite";
  if (!map.getSource(SRC)) {
    if (useTileset) {
      map.addSource(SRC, {
        type: "vector",
        url: `mapbox://${publicConfig.tilesetId}`,
        promoteId: { [publicConfig.tilesetLayer]: "jid" },
        minzoom: PARCEL_MIN_ZOOM,
      });
    } else {
      map.addSource(SRC, { type: "geojson", data: fallbackCache.collection(), promoteId: "jid" });
    }
  }
  const common = {
    source: SRC,
    ...(sourceLayer ? { "source-layer": sourceLayer } : {}),
    minzoom: PARCEL_MIN_ZOOM,
  };
  map.addLayer({
    id: FILL,
    type: "fill",
    ...common,
    paint: {
      "fill-color": fillColorExpression(p.dimension) as never,
      "fill-opacity": fillOpacity(p.dimension) as never,
    },
  });
  map.addLayer({
    id: LINE,
    type: "line",
    ...common,
    paint: {
      "line-color": satellite ? "#ffffff" : "#e8590c",
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0.35, 17, 0.9],
      "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.4, 18, 1.4],
    },
  });
  map.addLayer({
    id: HOVER,
    type: "line",
    ...common,
    paint: {
      "line-color": satellite ? "#ffe066" : "#1c7ed6",
      "line-width": 2,
      "line-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 1, 0],
    },
  });
  map.addLayer({
    id: SELECTED,
    type: "line",
    ...common,
    filter: ["==", ["to-number", ["get", "bfe"], -1], p.selectedBfe ?? -2],
    paint: {
      "line-color": satellite ? "#ffe066" : "#d6336c",
      "line-width": 3.5,
    },
  });
}

function add3dBuildings(map: MapboxMap) {
  if (map.getLayer(BUILDINGS) || !map.getSource("composite")) return;
  map.addLayer(
    {
      id: BUILDINGS,
      type: "fill-extrusion",
      source: "composite",
      "source-layer": "building",
      filter: ["==", ["get", "extrude"], "true"],
      minzoom: 15,
      paint: {
        "fill-extrusion-color": "#d9d4cc",
        "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 15, 0, 15.5, ["get", "height"]],
        "fill-extrusion-base": ["get", "min_height"],
        "fill-extrusion-opacity": 0.85,
      },
    },
    SELECTED,
  );
}

// --- GeoJSON-fallback, når der ikke er et MTS-tileset ----------------------

const fallbackCache = (() => {
  const features = new Map<string, GeoJSON.Feature>();
  const MAX = 6000;
  return {
    add(fc: GeoJSON.FeatureCollection) {
      for (const f of fc.features) {
        const id = String(f.properties?.jid ?? "");
        if (!id) continue;
        features.delete(id);
        features.set(id, f);
      }
      while (features.size > MAX) {
        const oldest = features.keys().next().value;
        if (oldest === undefined) break;
        features.delete(oldest);
      }
    },
    collection(): GeoJSON.FeatureCollection {
      return features.size ? { type: "FeatureCollection", features: [...features.values()] } : EMPTY;
    },
  };
})();

function attachGeoJsonFallback(map: MapboxMap) {
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const loaded = new Set<string>();

  const load = async () => {
    if (map.getZoom() < PARCEL_FALLBACK_MIN_ZOOM) return;
    const b = map.getBounds();
    if (!b) return;
    // Rund udsnittet af til et grid, så gentagne små panoreringer genbruger svar.
    const g = 0.004;
    const bbox = [
      Math.floor(b.getWest() / g) * g,
      Math.floor(b.getSouth() / g) * g,
      Math.ceil(b.getEast() / g) * g,
      Math.ceil(b.getNorth() / g) * g,
    ].map((n) => n.toFixed(4));
    const key = bbox.join(",");
    if (loaded.has(key)) return;
    controller?.abort();
    controller = new AbortController();
    try {
      const res = await fetch(`/api/jordstykker?bbox=${key}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const fc = (await res.json()) as GeoJSON.FeatureCollection;
      loaded.add(key);
      fallbackCache.add(fc);
      (map.getSource(SRC) as GeoJSONSource | undefined)?.setData(fallbackCache.collection());
    } catch (err) {
      if ((err as Error).name !== "AbortError") console.warn("[jordstykker]", err);
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(load, 250);
  };
  map.on("moveend", schedule);
  map.on("style.load", schedule);
  return () => {
    clearTimeout(timer);
    controller?.abort();
    map.off("moveend", schedule);
    map.off("style.load", schedule);
  };
}
