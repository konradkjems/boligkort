import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Cache af samlet ejendomskort pr. BFE
  properties: defineTable({
    bfe: v.number(),
    matrikel: v.object({
      matrikelnr: v.string(),
      ejerlav: v.string(),
      grundareal: v.number(),
    }),
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
    buildings: v.array(v.any()), // BBR-bygninger, normaliseret
    valuation: v.optional(
      v.object({
        aar: v.number(),
        ejendomsvaerdi: v.number(),
        grundvaerdi: v.number(),
      }),
    ),
    center: v.optional(v.object({ lng: v.number(), lat: v.number() })),
    bbox: v.optional(v.array(v.number())),
    fetchedAt: v.number(),
    sourceErrors: v.array(v.string()), // registre der fejlede
  }).index("by_bfe", ["bfe"]),

  // Log over opslag til monitorering af rate limits
  lookups: defineTable({
    bfe: v.number(),
    cacheHit: v.boolean(),
    ms: v.number(),
  }),
});
