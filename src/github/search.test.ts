import { describe, it, expect } from "vitest";
import {
  searchPullRequests,
  QUERY_AWAITING_MY_REVIEW,
  QUERY_MY_PRS_AWAITING_REVIEW,
} from "./search";
import type { FetchLike } from "./http";

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}): FetchLike {
  return async () => ({
    status,
    ok: status < 400,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

describe("query constants", () => {
  it("are the expected search strings", () => {
    expect(QUERY_AWAITING_MY_REVIEW).toBe("is:open is:pr review-requested:@me");
    expect(QUERY_MY_PRS_AWAITING_REVIEW).toBe(
      "is:open is:pr author:@me draft:false review:required"
    );
  });
});

describe("searchPullRequests", () => {
  it("maps items to PrSummary, deriving repo and url", async () => {
    const body = {
      items: [
        {
          number: 42,
          title: "Fix bug",
          html_url: "https://github.com/acme/repo/pull/42",
          updated_at: "2026-06-17T10:00:00Z",
          repository_url: "https://api.github.com/repos/acme/repo",
        },
      ],
    };
    const res = await searchPullRequests("tok", "q", fakeFetch(200, body));
    expect(res.prs).toEqual([
      {
        repoFullName: "acme/repo",
        number: 42,
        title: "Fix bug",
        url: "https://github.com/acme/repo/pull/42",
        updatedAt: "2026-06-17T10:00:00Z",
      },
    ]);
  });

  it("returns prs: [] when there are no items", async () => {
    expect((await searchPullRequests("tok", "q", fakeFetch(200, { items: [] }))).prs).toEqual([]);
  });

  it("throws an error carrying the status on non-2xx", async () => {
    await expect(searchPullRequests("tok", "q", fakeFetch(401, {}))).rejects.toMatchObject({
      status: 401,
    });
  });

  it("surfaces ssoPartialOrgIds when the X-GitHub-SSO header is present", async () => {
    const res = await searchPullRequests(
      "tok",
      "q",
      fakeFetch(200, { items: [] }, { "x-github-sso": "partial-results; organizations=21955855,20582480" })
    );
    expect(res.ssoPartialOrgIds).toEqual(["21955855", "20582480"]);
  });

  it("returns ssoPartialOrgIds: [] when the header is absent", async () => {
    const res = await searchPullRequests("tok", "q", fakeFetch(200, { items: [] }));
    expect(res.ssoPartialOrgIds).toEqual([]);
  });
});
