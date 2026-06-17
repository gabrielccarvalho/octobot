import { describe, it, expect } from "vitest";
import { buildAuthorizeUrl, exchangeCode, fetchViewerLogin } from "./oauth";
import type { FetchLike } from "./http";

function fakeFetch(handler: (url: string, init?: any) => any): FetchLike {
  return async (url, init) => {
    const r = handler(url, init);
    return {
      status: r.status ?? 200,
      ok: (r.status ?? 200) < 400,
      headers: { get: () => null },
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
    };
  };
}

describe("buildAuthorizeUrl", () => {
  it("includes client_id, redirect_uri, state and repo scope", () => {
    const url = buildAuthorizeUrl({ clientId: "cid", redirectUri: "https://h/oauth/callback", state: "s1" });
    expect(url).toContain("https://github.com/login/oauth/authorize?");
    expect(url).toContain("client_id=cid");
    expect(url).toContain("state=s1");
    expect(url).toContain("scope=repo");
    expect(url).toContain("redirect_uri=https%3A%2F%2Fh%2Foauth%2Fcallback");
  });
});

describe("exchangeCode", () => {
  it("returns the access token on success", async () => {
    const f = fakeFetch(() => ({ status: 200, body: { access_token: "gho_abc" } }));
    const token = await exchangeCode({ clientId: "c", clientSecret: "s", code: "code1" }, f);
    expect(token).toBe("gho_abc");
  });

  it("throws when GitHub returns an error", async () => {
    const f = fakeFetch(() => ({ status: 200, body: { error: "bad_verification_code" } }));
    await expect(exchangeCode({ clientId: "c", clientSecret: "s", code: "x" }, f)).rejects.toThrow();
  });
});

describe("fetchViewerLogin", () => {
  it("returns the login", async () => {
    const f = fakeFetch(() => ({ status: 200, body: { login: "octocat" } }));
    expect(await fetchViewerLogin("tok", f)).toBe("octocat");
  });

  it("throws on a non-ok response", async () => {
    const f = fakeFetch(() => ({ status: 401, body: {} }));
    await expect(fetchViewerLogin("tok", f)).rejects.toThrow();
  });
});
