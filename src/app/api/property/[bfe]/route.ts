import { parseBfe } from "@/lib/format";
import { DatafordelerError, fetchPropertyCard } from "@/server/datafordeler";

// REST-fallback til sidepanelet, når Convex ikke er konfigureret.
export async function GET(_req: Request, ctx: RouteContext<"/api/property/[bfe]">) {
  const bfe = parseBfe((await ctx.params).bfe);
  if (!bfe) return Response.json({ error: "Ugyldigt BFE-nummer." }, { status: 400 });
  try {
    const card = await fetchPropertyCard(bfe);
    const cache =
      card.sourceErrors.length === 0
        ? "public, s-maxage=86400, stale-while-revalidate=604800"
        : "no-store";
    return Response.json(card, { headers: { "Cache-Control": cache } });
  } catch (err) {
    return errorResponse(err);
  }
}

function errorResponse(err: unknown) {
  if (err instanceof DatafordelerError) {
    return Response.json({ error: err.userMessage }, { status: err.status });
  }
  console.error(err);
  return Response.json({ error: "Opslaget fejlede." }, { status: 502 });
}
