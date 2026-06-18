import { describe, it, expect } from "vitest";
import { fetchLatestReview } from "./reviews";
import type { FetchLike } from "./http";

function fakeFetch(status: number, body: unknown): FetchLike {
  return async () => ({
    status,
    ok: status < 400,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

const review = (state: string, submitted_at: string | null) => ({ state, submitted_at });

describe("fetchLatestReview", () => {
  it("returns the most recently submitted review", async () => {
    const f = fakeFetch(200, [
      review("APPROVED", "2026-06-17T10:00:00Z"),
      review("CHANGES_REQUESTED", "2026-06-18T09:00:00Z"),
      review("COMMENTED", "2026-06-17T12:00:00Z"),
    ]);
    const res = await fetchLatestReview("tok", "acme/repo", 42, f);
    expect(res).toEqual({ state: "CHANGES_REQUESTED", submittedAt: "2026-06-18T09:00:00Z" });
  });

  it("ignores pending reviews with a null submitted_at", async () => {
    const f = fakeFetch(200, [review("APPROVED", "2026-06-17T10:00:00Z"), review("PENDING", null)]);
    const res = await fetchLatestReview("tok", "acme/repo", 42, f);
    expect(res).toEqual({ state: "APPROVED", submittedAt: "2026-06-17T10:00:00Z" });
  });

  it("returns null when there are no reviews", async () => {
    expect(await fetchLatestReview("tok", "acme/repo", 42, fakeFetch(200, []))).toBeNull();
  });

  it("returns null on a non-200 response", async () => {
    expect(await fetchLatestReview("tok", "acme/repo", 42, fakeFetch(403, null))).toBeNull();
  });

  it("calls the pulls reviews endpoint with a bearer token", async () => {
    let calledUrl = "";
    let auth: string | undefined;
    const f: FetchLike = async (url, init) => {
      calledUrl = url;
      auth = init?.headers?.authorization;
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => [], text: async () => "[]" };
    };
    await fetchLatestReview("tok", "acme/repo", 42, f);
    expect(calledUrl).toBe("https://api.github.com/repos/acme/repo/pulls/42/reviews");
    expect(auth).toBe("Bearer tok");
  });
});
