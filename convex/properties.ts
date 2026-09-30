import { v } from "convex/values";
import {
  fetchPropertyCard,
  resolveAddress as resolveDar,
  searchAddresses as searchDar,
} from "../src/server/datafordeler";
import { isStale } from "../src/lib/data/freshness";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, query } from "./_generated/server";

// Opslagsflow (PRD):
// 1. Klienten kalder getProperty(bfe) og får cachet række (eller null).
// 2. Mangler rækken eller er den ældre end 7 dage, kalder klienten
//    refreshProperty(bfe), som henter MAT, EBR/DAR, BBR og VUR parallelt.
// 3. Actionen skriver via upsert, og getProperty opdaterer sidepanelet reaktivt.

export const getProperty = query({
  args: { bfe: v.number() },
  handler: async (ctx, { bfe }) => {
    return await ctx.db
      .query("properties")
      .withIndex("by_bfe", (q) => q.eq("bfe", bfe))
      .unique();
  },
});

export const getPropertyInternal = internalQuery({
  args: { bfe: v.number() },
  handler: async (ctx, { bfe }) => {
    return await ctx.db
      .query("properties")
      .withIndex("by_bfe", (q) => q.eq("bfe", bfe))
      .unique();
  },
});

export const refreshProperty = action({
  args: { bfe: v.number(), force: v.optional(v.boolean()) },
  handler: async (ctx, { bfe, force }): Promise<{ cacheHit: boolean }> => {
    if (!Number.isInteger(bfe) || bfe <= 0) throw new Error("Ugyldigt BFE-nummer.");
    const started = Date.now();
    if (!force) {
      // En anden klient kan have opdateret rækken i mellemtiden.
      const existing = await ctx.runQuery(internal.properties.getPropertyInternal, { bfe });
      if (existing && !isStale(existing)) {
        await ctx.runMutation(internal.properties.logLookup, {
          bfe,
          cacheHit: true,
          ms: Date.now() - started,
        });
        return { cacheHit: true };
      }
    }
    const card = await fetchPropertyCard(bfe);
    await ctx.runMutation(internal.properties.upsert, { card });
    await ctx.runMutation(internal.properties.logLookup, {
      bfe,
      cacheHit: false,
      ms: Date.now() - started,
    });
    return { cacheHit: false };
  },
});

const cardValidator = v.object({
  bfe: v.number(),
  matrikel: v.object({ matrikelnr: v.string(), ejerlav: v.string(), grundareal: v.number() }),
  jordstykker: v.optional(
    v.array(
      v.object({
        id: v.string(),
        matrikelnr: v.string(),
        ejerlav: v.string(),
        ejerlavskode: v.optional(v.number()),
        areal: v.number(),
      }),
    ),
  ),
  addresses: v.array(v.object({ id: v.string(), text: v.string() })),
  buildings: v.array(v.any()),
  valuation: v.optional(
    v.object({ aar: v.number(), ejendomsvaerdi: v.number(), grundvaerdi: v.number() }),
  ),
  center: v.optional(v.object({ lng: v.number(), lat: v.number() })),
  bbox: v.optional(v.array(v.number())),
  fetchedAt: v.number(),
  sourceErrors: v.array(v.string()),
});

export const upsert = internalMutation({
  args: { card: cardValidator },
  handler: async (ctx, { card }) => {
    const existing = await ctx.db
      .query("properties")
      .withIndex("by_bfe", (q) => q.eq("bfe", card.bfe))
      .unique();
    if (existing) await ctx.db.replace(existing._id, card);
    else await ctx.db.insert("properties", card);
  },
});

export const logLookup = internalMutation({
  args: { bfe: v.number(), cacheHit: v.boolean(), ms: v.number() },
  handler: async (ctx, row) => {
    await ctx.db.insert("lookups", row);
  },
});

export const searchAddresses = action({
  args: { q: v.string() },
  handler: async (_ctx, { q }) => {
    return await searchDar(q);
  },
});

/** Slår en valgt adresse op i DAR/EBR og returnerer koordinat + BFE. */
export const resolveAddress = action({
  args: { id: v.string() },
  handler: async (_ctx, { id }) => {
    return await resolveDar(id);
  },
});
