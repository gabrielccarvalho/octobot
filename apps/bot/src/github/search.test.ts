import { describe, it, expect } from "vitest";
import {
  searchPullRequests,
  searchMyPrsAwaitingReview,
  fetchPrAuthor,
  QUERY_AWAITING_MY_REVIEW,
  QUERY_MY_OPEN_PRS,
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

// Routes different responses by URL: the `/search/issues` call gets `searchBody`,
// while each `/pulls/<number>` call gets whatever `pullsBodies` has keyed by PR number
// (or `pullsStatus` to force a non-2xx response for that PR).
function fakeRoutingFetch(
  searchBody: unknown,
  pullsBodies: Record<number, unknown>,
  options: { searchHeaders?: Record<string, string>; pullsStatus?: Record<number, number> } = {}
): FetchLike {
  return async (url: string) => {
    if (url.includes("/search/issues")) {
      const headers = options.searchHeaders ?? {};
      return {
        status: 200,
        ok: true,
        headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
        json: async () => searchBody,
        text: async () => JSON.stringify(searchBody),
      };
    }
    const match = url.match(/\/pulls\/(\d+)/);
    const number = match ? Number(match[1]) : -1;
    const status = options.pullsStatus?.[number] ?? 200;
    const body = pullsBodies[number] ?? {};
    return {
      status,
      ok: status < 400,
      headers: { get: () => null },
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
}

describe("query constants", () => {
  it("are the expected search strings", () => {
    expect(QUERY_AWAITING_MY_REVIEW).toBe("is:open is:pr review-requested:@me");
    expect(QUERY_MY_OPEN_PRS).toBe("is:open is:pr author:@me draft:false");
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

describe("searchMyPrsAwaitingReview", () => {
  const searchBody = {
    items: [
      {
        number: 1,
        title: "Add feature",
        html_url: "https://github.com/acme/repo/pull/1",
        updated_at: "2026-06-17T10:00:00Z",
        repository_url: "https://api.github.com/repos/acme/repo",
      },
      {
        number: 2,
        title: "Fix bug",
        html_url: "https://github.com/acme/repo/pull/2",
        updated_at: "2026-06-18T10:00:00Z",
        repository_url: "https://api.github.com/repos/acme/repo",
      },
    ],
  };

  it("attaches requested_reviewers logins as @-prefixed requestedReviewers", async () => {
    const fetchImpl = fakeRoutingFetch(searchBody, {
      1: { requested_reviewers: [{ login: "majovanilla" }] },
      2: { requested_reviewers: [] },
    });
    const res = await searchMyPrsAwaitingReview("tok", fetchImpl);
    const pr1 = res.prs.find((p) => p.number === 1);
    expect(pr1?.requestedReviewers).toEqual(["@majovanilla"]);
  });

  it("returns an empty array when there are no requested reviewers or teams", async () => {
    const fetchImpl = fakeRoutingFetch(searchBody, {
      1: { requested_reviewers: [], requested_teams: [] },
      2: {},
    });
    const res = await searchMyPrsAwaitingReview("tok", fetchImpl);
    const pr2 = res.prs.find((p) => p.number === 2);
    expect(pr2?.requestedReviewers).toEqual([]);
  });

  it("includes requested_teams as @-prefixed slugs", async () => {
    const fetchImpl = fakeRoutingFetch(searchBody, {
      1: { requested_reviewers: [], requested_teams: [{ slug: "frontend" }] },
      2: {},
    });
    const res = await searchMyPrsAwaitingReview("tok", fetchImpl);
    const pr1 = res.prs.find((p) => p.number === 1);
    expect(pr1?.requestedReviewers).toEqual(["@frontend"]);
  });

  it("preserves ssoPartialOrgIds from the candidate search response", async () => {
    const fetchImpl = fakeRoutingFetch(
      searchBody,
      { 1: {}, 2: {} },
      { searchHeaders: { "x-github-sso": "partial-results; organizations=21955855" } }
    );
    const res = await searchMyPrsAwaitingReview("tok", fetchImpl);
    expect(res.ssoPartialOrgIds).toEqual(["21955855"]);
  });

  it("fails open with requestedReviewers: undefined when a PR's pulls fetch is not ok, without throwing and without dropping the PR", async () => {
    const fetchImpl = fakeRoutingFetch(
      searchBody,
      { 1: {}, 2: {} },
      { pullsStatus: { 2: 404 } }
    );
    const res = await searchMyPrsAwaitingReview("tok", fetchImpl);
    expect(res.prs).toHaveLength(2);
    const pr2 = res.prs.find((p) => p.number === 2);
    expect(pr2?.requestedReviewers).toBeUndefined();
    const pr1 = res.prs.find((p) => p.number === 1);
    expect(pr1?.requestedReviewers).toEqual([]);
  });
});

describe("fetchPrAuthor", () => {
  const fakeFetch = (status: number, body: unknown): FetchLike => async () => ({
    status,
    ok: status < 400,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

  it("returns the PR author login", async () => {
    expect(await fetchPrAuthor("tok", "acme/repo", 42, fakeFetch(200, { user: { login: "khalil376" } }))).toBe(
      "khalil376"
    );
  });

  it("returns null on a non-2xx response", async () => {
    expect(await fetchPrAuthor("tok", "acme/repo", 42, fakeFetch(404, null))).toBeNull();
  });

  it("returns null when the author login is missing", async () => {
    expect(await fetchPrAuthor("tok", "acme/repo", 42, fakeFetch(200, {}))).toBeNull();
  });

  it("returns null instead of throwing when the fetch fails", async () => {
    const throwing: FetchLike = async () => {
      throw new Error("network");
    };
    expect(await fetchPrAuthor("tok", "acme/repo", 42, throwing)).toBeNull();
  });
});
