// Transport mod Datafordelerens GraphQL-tjenester. Alle kald til
// Datafordeleren går gennem dette modul (PRD: "Isolér alle kald i ét modul").
//
// Kører både i Convex actions og i Next.js route handlers, så modulet må kun
// bruge fetch og process.env.

export type Register = "MAT" | "BBR" | "DAR" | "EBR" | "VUR";

const DEFAULT_VERSIONS: Record<Register, string> = {
  BBR: "v3",
  DAR: "v3",
  MAT: "v2",
  EBR: "v1",
  VUR: "v2",
};

const DEFAULT_TOKEN_URL =
  "https://auth.datafordeler.dk/realms/distribution/protocol/openid-connect/token";

/** Timeout pr. register (PRD: 5 s). */
export const REGISTER_TIMEOUT_MS = 5000;

export class DatafordelerError extends Error {
  constructor(
    message: string,
    readonly status = 502,
    readonly userMessage = "Datafordeleren svarede ikke som forventet.",
  ) {
    super(message);
    this.name = "DatafordelerError";
  }
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function versions(): Record<Register, string> {
  // Fx DATAFORDELER_VERSIONS="BBR=v3,MAT=v2"
  const out = { ...DEFAULT_VERSIONS };
  for (const part of (env("DATAFORDELER_VERSIONS") ?? "").split(",")) {
    const [k, v] = part.split("=").map((s) => s?.trim());
    if (k && v && k in out) out[k as Register] = v;
  }
  return out;
}

export function endpointFor(register: Register): string {
  const base = (env("DATAFORDELER_GRAPHQL_URL") ?? "https://graphql.datafordeler.dk").replace(/\/+$/, "");
  return `${base}/${register}/${versions()[register]}`;
}

export function isConfigured(): boolean {
  return Boolean(
    env("DATAFORDELER_API_KEY") ||
      (env("DATAFORDELER_CLIENT_ID") && env("DATAFORDELER_CLIENT_SECRET")),
  );
}

// --- Autentifikation ---------------------------------------------------------
// OAuth (client credentials / Shared Secret) foretrækkes. En API-nøgle
// understøttes også, da Datafordeleren udsteder dem til ikke-beskyttede data.

let cachedToken: { value: string; expiresAt: number } | null = null;

async function oauthToken(fetchImpl: typeof fetch): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.value;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env("DATAFORDELER_CLIENT_ID")!,
    client_secret: env("DATAFORDELER_CLIENT_SECRET")!,
  });
  const res = await fetchImpl(env("DATAFORDELER_TOKEN_URL") ?? DEFAULT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: timeoutSignal(REGISTER_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new DatafordelerError(
      `OAuth-token fejlede: HTTP ${res.status}`,
      502,
      "Kunne ikke logge på Datafordeleren.",
    );
  }
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 300) * 1000,
  };
  return cachedToken.value;
}

async function authorize(
  url: URL,
  fetchImpl: typeof fetch,
): Promise<Record<string, string>> {
  if (env("DATAFORDELER_CLIENT_ID") && env("DATAFORDELER_CLIENT_SECRET")) {
    return { Authorization: `Bearer ${await oauthToken(fetchImpl)}` };
  }
  const key = env("DATAFORDELER_API_KEY");
  if (key) {
    url.searchParams.set("apiKey", key);
    return {};
  }
  throw new DatafordelerError(
    "Datafordeler-credentials mangler (DATAFORDELER_CLIENT_ID/SECRET eller DATAFORDELER_API_KEY).",
    503,
    "Datafordeleren er ikke konfigureret på serveren.",
  );
}

// --- GraphQL ------------------------------------------------------------------

type GqlOptions = { timeoutMs?: number; fetchImpl?: typeof fetch };

const RETRY_STATUS = new Set([429, 502, 503, 504]);

export async function gql<T>(
  register: Register,
  query: string,
  variables: Record<string, unknown>,
  opts: GqlOptions = {},
): Promise<T> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const deadline = Date.now() + (opts.timeoutMs ?? REGISTER_TIMEOUT_MS);
  let attempt = 0;
  for (;;) {
    attempt++;
    const url = new URL(endpointFor(register));
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(await authorize(url, fetchImpl)),
    };
    const remaining = Math.max(500, deadline - Date.now());
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ query, variables }),
        signal: timeoutSignal(remaining),
      });
    } catch (err) {
      const timedOut = (err as Error).name === "TimeoutError" || (err as Error).name === "AbortError";
      throw new DatafordelerError(
        `${register}: ${timedOut ? "timeout" : (err as Error).message}`,
        504,
        `${register} svarede ikke i tide.`,
      );
    }

    // Backoff ved rate limit / midlertidige fejl, hvis der er tid tilbage.
    if (RETRY_STATUS.has(res.status) && attempt < 3 && deadline - Date.now() > 1200) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 250 * attempt;
      await sleep(Math.min(wait, deadline - Date.now() - 1000));
      continue;
    }

    const text = await res.text();
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) cachedToken = null;
      throw new DatafordelerError(
        `${register} HTTP ${res.status}: ${text.slice(0, 300)}`,
        res.status === 429 ? 429 : 502,
        res.status === 429 ? "For mange opslag lige nu. Prøv igen om lidt." : `${register} fejlede.`,
      );
    }
    let body: { data?: T; errors?: { message: string }[] };
    try {
      body = JSON.parse(text);
    } catch {
      throw new DatafordelerError(`${register}: ugyldig JSON`);
    }
    if (body.errors?.length) {
      throw new DatafordelerError(`${register} GraphQL: ${body.errors.map((e) => e.message).join("; ")}`);
    }
    if (!body.data) throw new DatafordelerError(`${register}: tomt svar`);
    return body.data;
  }
}

type Connection<N> = {
  nodes: N[];
  pageInfo?: { hasNextPage: boolean; endCursor: string | null };
};

/**
 * Henter alle sider af en connection. Forespørgslen skal tage $after og
 * returnere pageInfo { hasNextPage endCursor }.
 */
export async function gqlAll<N>(
  register: Register,
  root: string,
  query: string,
  variables: Record<string, unknown>,
  opts: GqlOptions & { maxPages?: number } = {},
): Promise<N[]> {
  const out: N[] = [];
  let after: string | null = null;
  for (let page = 0; page < (opts.maxPages ?? 10); page++) {
    const data: Record<string, Connection<N>> = await gql(
      register,
      query,
      { ...variables, after },
      opts,
    );
    const conn = data[root];
    out.push(...(conn?.nodes ?? []));
    if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    after = conn.pageInfo.endCursor;
  }
  return out;
}

/** `in`-filtre må højst have 100 elementer. */
export function chunk<T>(items: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Bitemporalitet: spørg på "nu" for både virknings- og registreringstid, så
 * kun aktuelle versioner returneres.
 */
export function now(date = new Date()) {
  const t = date.toISOString();
  return { vt: t, rt: t };
}

/**
 * AbortSignal med timeout. AbortSignal.timeout() findes ikke i alle runtimes
 * (fx Convex), så vi bygger den selv.
 */
export function timeoutSignal(ms: number): AbortSignal {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new DOMExceptionLike("TimeoutError")), ms);
  // Lad ikke timeren holde Node-processen i live.
  (t as { unref?: () => void }).unref?.();
  return ctrl.signal;
}

class DOMExceptionLike extends Error {
  constructor(name: string) {
    super(name);
    this.name = name;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

/** Kun til tests. */
export function __resetTokenCache() {
  cachedToken = null;
}
