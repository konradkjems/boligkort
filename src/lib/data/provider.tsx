"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { publicConfig } from "../config";

const client = publicConfig.convexUrl ? new ConvexReactClient(publicConfig.convexUrl) : null;

/** Wrapper om Convex, når NEXT_PUBLIC_CONVEX_URL er sat. Ellers bruges REST-fallbacken. */
export function DataProvider({ children }: { children: React.ReactNode }) {
  return client ? <ConvexProvider client={client}>{children}</ConvexProvider> : <>{children}</>;
}
