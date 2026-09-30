import { CACHE_TTL_MS } from "../config";

/** Delvise svar (et register fejlede) forsøges igen efter 5 minutter. */
export const PARTIAL_TTL_MS = 5 * 60 * 1000;

export function isStale(
  row: { fetchedAt: number; sourceErrors: string[] },
  now = Date.now(),
): boolean {
  const age = now - row.fetchedAt;
  return age > CACHE_TTL_MS || (row.sourceErrors.length > 0 && age > PARTIAL_TTL_MS);
}
