import { DatafordelerError, resolveAddress } from "@/server/datafordeler";

// Opslag af valgt adresse: koordinat + BFE (REST-fallback uden Convex).
export async function GET(_req: Request, ctx: RouteContext<"/api/address/[id]">) {
  const { id } = await ctx.params;
  try {
    const result = await resolveAddress(id);
    return Response.json(result, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch (err) {
    if (err instanceof DatafordelerError) {
      return Response.json({ error: err.userMessage }, { status: err.status });
    }
    console.error(err);
    return Response.json({ error: "Adressen kunne ikke slås op." }, { status: 502 });
  }
}
