import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetTokenCache, chunk, gql, gqlAll } from "../src/server/datafordeler/client";

beforeEach(() => {
  __resetTokenCache();
  vi.stubEnv("DATAFORDELER_API_KEY", "");
  vi.stubEnv("DATAFORDELER_CLIENT_ID", "");
  vi.stubEnv("DATAFORDELER_CLIENT_SECRET", "");
});
afterEach(() => vi.unstubAllEnvs());

const ok = (data: unknown) => Response.json({ data });

describe("gql", () => {
  it("bruger OAuth client credentials og genbruger tokenet", async () => {
    vi.stubEnv("DATAFORDELER_CLIENT_ID", "cid");
    vi.stubEnv("DATAFORDELER_CLIENT_SECRET", "secret");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("openid-connect/token")) {
        expect(String(init?.body)).toContain("grant_type=client_credentials");
        return Response.json({ access_token: "tok", expires_in: 300 });
      }
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
      expect(new URL(url).searchParams.has("apiKey")).toBe(false);
      return ok({ X: 1 });
    });
    await gql("BBR", "{ X }", {}, { fetchImpl: fetchImpl as typeof fetch });
    await gql("BBR", "{ X }", {}, { fetchImpl: fetchImpl as typeof fetch });
    const tokenCalls = fetchImpl.mock.calls.filter(([u]) => String(u).includes("token"));
    expect(tokenCalls).toHaveLength(1);
  });

  it("kaster ved GraphQL-fejl", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "k");
    const fetchImpl = async () => Response.json({ errors: [{ message: "DAF-GQL-0009" }] });
    await expect(gql("MAT", "{ X }", {}, { fetchImpl })).rejects.toThrow(/DAF-GQL-0009/);
  });

  it("prøver igen ved 429", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "k");
    let n = 0;
    const fetchImpl = async () =>
      ++n === 1 ? new Response("slow down", { status: 429, headers: { "retry-after": "0" } }) : ok({ X: 2 });
    await expect(gql("MAT", "{ X }", {}, { fetchImpl })).resolves.toEqual({ X: 2 });
    expect(n).toBe(2);
  });

  it("respekterer versions-override", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "k");
    vi.stubEnv("DATAFORDELER_VERSIONS", "BBR=v4");
    let path = "";
    const fetchImpl = async (input: RequestInfo | URL) => {
      path = new URL(String(input)).pathname;
      return ok({});
    };
    await gql("BBR", "{ X }", {}, { fetchImpl });
    expect(path).toBe("/BBR/v4");
  });
});

describe("gqlAll", () => {
  it("følger pageInfo.endCursor", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "k");
    const fetchImpl = async (_: RequestInfo | URL, init?: RequestInit) => {
      const after = JSON.parse(String(init?.body)).variables.after;
      return after
        ? ok({ R: { nodes: [3], pageInfo: { hasNextPage: false, endCursor: null } } })
        : ok({ R: { nodes: [1, 2], pageInfo: { hasNextPage: true, endCursor: "c1" } } });
    };
    await expect(gqlAll("MAT", "R", "q", {}, { fetchImpl })).resolves.toEqual([1, 2, 3]);
  });
});

it("chunk deler i grupper af højst 100", () => {
  expect(chunk(Array.from({ length: 250 }, (_, i) => i)).map((c) => c.length)).toEqual([100, 100, 50]);
});
