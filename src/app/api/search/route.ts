import { DatafordelerError, searchAddresses } from "@/server/datafordeler";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return Response.json([]);
  try {
    const results = await searchAddresses(q.slice(0, 120));
    return Response.json(results, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (err) {
    const status = err instanceof DatafordelerError ? err.status : 502;
    if (!(err instanceof DatafordelerError)) console.error(err);
    return Response.json({ error: "Søgningen fejlede." }, { status });
  }
}
