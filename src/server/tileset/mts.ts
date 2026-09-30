// Upload til Mapbox Tiling Service (MTS): tileset source → recipe → publish.
// Kræver et secret token med scopes tilesets:write, tilesets:read og tilesets:list.

const API = "https://api.mapbox.com/tilesets/v1";

export type MtsConfig = {
  token: string;
  username: string;
  /** Tileset-navn uden brugernavn, fx "ejendomskort-jordstykker". */
  tileset: string;
  layer: string;
  minzoom?: number;
  maxzoom?: number;
  log?: (m: string) => void;
  fetchImpl?: typeof fetch;
};

export function recipeFor(cfg: Pick<MtsConfig, "username" | "tileset" | "layer" | "minzoom" | "maxzoom">) {
  return {
    version: 1,
    layers: {
      [cfg.layer]: {
        source: `mapbox://tileset-source/${cfg.username}/${cfg.tileset}`,
        // PRD: synligt fra zoom 14; maxzoom 16 overzoomes af klienten.
        minzoom: cfg.minzoom ?? 14,
        maxzoom: cfg.maxzoom ?? 16,
        tiles: { layer_size: 2500 },
      },
    },
  };
}

export async function publishToMts(ldgeojson: string, cfg: MtsConfig): Promise<string> {
  const f = cfg.fetchImpl ?? fetch;
  const log = cfg.log ?? console.log;
  const q = `access_token=${encodeURIComponent(cfg.token)}`;
  const id = `${cfg.username}.${cfg.tileset}`;
  const call = async (method: string, path: string, body?: BodyInit, json = true) => {
    const res = await f(`${API}${path}${path.includes("?") ? "&" : "?"}${q}`, {
      method,
      body,
      headers: body && json ? { "Content-Type": "application/json" } : undefined,
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { ok: res.ok, status: res.status, data: data as Record<string, unknown> | null };
  };

  // 1. Erstat tileset source (PUT erstatter; POST ville tilføje).
  const form = new FormData();
  form.append("file", new Blob([ldgeojson], { type: "application/x-ndjson" }), "jordstykker.ldgeojson");
  const src = await call("PUT", `/sources/${cfg.username}/${cfg.tileset}`, form, false);
  if (!src.ok) throw new Error(`MTS source upload fejlede (${src.status}): ${JSON.stringify(src.data)}`);
  log(`MTS: source uploadet (${JSON.stringify(src.data)})`);

  // 2. Opret tileset eller opdatér recipe.
  const recipe = recipeFor(cfg);
  const created = await call(
    "POST",
    `/${id}`,
    JSON.stringify({ recipe, name: "Ejendomskort jordstykker", private: false }),
  );
  if (!created.ok) {
    const upd = await call("PATCH", `/${id}/recipe`, JSON.stringify(recipe));
    if (!upd.ok && upd.status !== 204) {
      throw new Error(`MTS recipe fejlede (${upd.status}): ${JSON.stringify(upd.data)}`);
    }
  }

  // 3. Publish og vent på jobbet.
  const pub = await call("POST", `/${id}/publish`);
  if (!pub.ok) throw new Error(`MTS publish fejlede (${pub.status}): ${JSON.stringify(pub.data)}`);
  const jobId = String(pub.data?.jobId ?? "");
  log(`MTS: publish startet (job ${jobId})`);
  for (let i = 0; i < 120 && jobId; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    const job = await call("GET", `/${id}/jobs/${jobId}`);
    const stage = String(job.data?.stage ?? "");
    if (stage === "success") {
      log("MTS: tileset publiceret");
      return id;
    }
    if (stage === "failed") throw new Error(`MTS job fejlede: ${JSON.stringify(job.data)}`);
  }
  if (jobId) throw new Error("MTS job blev ikke færdigt inden for 20 minutter");
  return id;
}
