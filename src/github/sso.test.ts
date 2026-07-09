import { describe, it, expect } from "vitest";
import { parseSsoPartialOrgs, fetchSsoPartialOrgs } from "./sso";
import type { FetchLike } from "./http";

function fakeFetch(handler: (url: string, init?: any) => any): FetchLike {
  return async (url, init) => {
    const r = handler(url, init);
    return {
      status: r.status ?? 200,
      ok: (r.status ?? 200) < 400,
      headers: { get: (name: string) => (r.headers ? r.headers[name.toLowerCase()] ?? null : null) },
      json: async () => r.body ?? {},
      text: async () => JSON.stringify(r.body ?? {}),
    };
  };
}

describe("parseSsoPartialOrgs", () => {
  it("returns [] for null", () => {
    expect(parseSsoPartialOrgs(null)).toEqual([]);
  });

  it("returns [] for an empty string", () => {
    expect(parseSsoPartialOrgs("")).toEqual([]);
  });

  it("returns [] for the required (403) form, not partial results", () => {
    expect(parseSsoPartialOrgs("required; url=https://github.com/orgs/acme/sso")).toEqual([]);
  });

  it("returns the org IDs for a partial-results header", () => {
    expect(parseSsoPartialOrgs("partial-results; organizations=21955855,20582480")).toEqual([
      "21955855",
      "20582480",
    ]);
  });
});

describe("fetchSsoPartialOrgs", () => {
  it("returns the org IDs when the response is ok and carries the header", async () => {
    const f = fakeFetch(() => ({
      status: 200,
      body: [],
      headers: { "x-github-sso": "partial-results; organizations=21955855,20582480" },
    }));
    expect(await fetchSsoPartialOrgs("tok", f)).toEqual(["21955855", "20582480"]);
  });

  it("returns [] when the response is ok but has no SSO header", async () => {
    const f = fakeFetch(() => ({ status: 200, body: [] }));
    expect(await fetchSsoPartialOrgs("tok", f)).toEqual([]);
  });

  it("returns [] when the response is not ok", async () => {
    const f = fakeFetch(() => ({ status: 401, body: {} }));
    expect(await fetchSsoPartialOrgs("tok", f)).toEqual([]);
  });
});
