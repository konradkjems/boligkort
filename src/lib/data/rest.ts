"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PropertyState } from "@/components/Sidebar";
import type { AddressApi, AddressSuggestion, PropertyCard, ResolvedAddress } from "../types";
import { isStale } from "./freshness";

// Fallback uden Convex: Next.js route handlers henter direkte fra
// Datafordeleren, og Vercels CDN cacher svarene (Cache-Control).

const memory = new Map<number, PropertyCard>();

type Loaded = { bfe: number; nonce: number; card?: PropertyCard; error?: string };

export function useRestPropertyCard(bfe: number | null): PropertyState {
  const [state, setState] = useState<Loaded | null>(null);
  const [nonce, setNonce] = useState(0);
  const forced = useRef<number | null>(null);

  const cached = bfe ? memory.get(bfe) : undefined;
  const cacheOk = Boolean(cached && !isStale(cached));

  useEffect(() => {
    if (!bfe || cacheOk) return;
    const ctrl = new AbortController();
    const fresh = forced.current === bfe ? `?fresh=${Date.now()}` : "";
    fetch(`/api/property/${bfe}${fresh}`, { signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? `Opslaget fejlede (HTTP ${res.status}).`);
        memory.set(bfe, body as PropertyCard);
        setState({ bfe, nonce, card: body as PropertyCard });
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setState({ bfe, nonce, error: err.message });
      });
    return () => ctrl.abort();
  }, [bfe, nonce, cacheOk]);

  const retry = useCallback(() => {
    if (!bfe) return;
    memory.delete(bfe);
    forced.current = bfe;
    setNonce((n) => n + 1);
  }, [bfe]);

  const mine = state && state.bfe === bfe ? state : null;
  const settled = Boolean(mine && mine.nonce === nonce);
  const card = cacheOk ? cached : (mine?.card ?? cached);

  if (card) return { status: "ready", card, refreshing: !cacheOk && !settled, retry };
  if (settled && mine?.error) return { status: "error", error: mine.error, refreshing: false, retry };
  return { status: "loading", refreshing: false, retry };
}

const restAddressApi: AddressApi = {
  async search(q) {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as AddressSuggestion[];
  },
  async resolve(id) {
    const res = await fetch(`/api/address/${encodeURIComponent(id)}`);
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
    return body as ResolvedAddress;
  },
};

export function useRestAddressSearch(): AddressApi {
  return restAddressApi;
}
