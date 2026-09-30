"use client";

import { useAction, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { PropertyState } from "@/components/Sidebar";
import type { AddressApi, AddressSuggestion, PropertyCard, ResolvedAddress } from "../types";
import { isStale } from "./freshness";

type RefreshState = { bfe: number; running: boolean; error?: string };

export function useConvexPropertyCard(bfe: number | null): PropertyState {
  const row = useQuery(api.properties.getProperty, bfe ? { bfe } : "skip");
  const refresh = useAction(api.properties.refreshProperty);
  const [rs, setRs] = useState<RefreshState | null>(null);
  const requested = useRef(new Set<number>());

  const run = useCallback(
    async (b: number, force: boolean) => {
      setRs({ bfe: b, running: true });
      try {
        await refresh({ bfe: b, force });
        setRs({ bfe: b, running: false });
      } catch (err) {
        setRs({ bfe: b, running: false, error: messageOf(err) });
      }
    },
    [refresh],
  );

  // Cache-miss eller forældet række: hent fra Datafordeleren via action.
  useEffect(() => {
    if (!bfe || row === undefined) return;
    if (row !== null && !isStale(row)) return;
    if (requested.current.has(bfe)) return;
    requested.current.add(bfe);
    void run(bfe, false);
  }, [bfe, row, run]);

  const card = (row ?? undefined) as PropertyCard | undefined;
  const mine = rs && rs.bfe === bfe ? rs : null;
  const refreshing = Boolean(mine?.running);
  const retry = useCallback(() => {
    if (bfe) void run(bfe, true);
  }, [bfe, run]);

  if (card) return { status: "ready", card, refreshing, retry };
  if (mine?.error) return { status: "error", error: mine.error, refreshing: false, retry };
  return { status: "loading", refreshing, retry };
}

export function useConvexAddressSearch(): AddressApi {
  const search = useAction(api.properties.searchAddresses);
  const resolve = useAction(api.properties.resolveAddress);
  return useMemo(
    () => ({
      search: (q: string) => search({ q }) as Promise<AddressSuggestion[]>,
      resolve: (id: string) => resolve({ id }) as Promise<ResolvedAddress>,
    }),
    [search, resolve],
  );
}

function messageOf(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Convex pakker serverfejl ind i "[CONVEX A(...)] ... Uncaught Error: <besked>".
  const m = raw.match(/Uncaught Error: (.*?)(\n|$)/);
  return m?.[1] ?? "Opslaget fejlede. Prøv igen.";
}
