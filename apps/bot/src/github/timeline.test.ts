import { describe, it, expect } from "vitest";
import { selectPrEvent, fetchPrEvent } from "./timeline";
import type { FetchLike } from "./http";

// Timeline fixtures. `at` for the notification is 2026-06-17T10:00:00Z throughout.
const AT = "2026-06-17T10:00:00Z";
const ev = (event: string, ts: string, extra: Record<string, unknown> = {}) => ({
  event,
  created_at: ts,
  ...extra,
});

describe("selectPrEvent", () => {
  it("maps a reviewed(approved) event to approved", () => {
    const raw = [{ event: "reviewed", state: "approved", submitted_at: AT }];
    expect(selectPrEvent(raw, AT)).toEqual({ kind: "approved", at: AT });
  });

  it("maps reviewed states case-insensitively", () => {
    expect(selectPrEvent([{ event: "reviewed", state: "CHANGES_REQUESTED", submitted_at: AT }], AT))
      .toEqual({ kind: "changes_requested", at: AT });
    expect(selectPrEvent([{ event: "reviewed", state: "commented", submitted_at: AT }], AT)?.kind)
      .toBe("reviewed");
  });

  it("ignores a dismissed review", () => {
    expect(selectPrEvent([{ event: "reviewed", state: "dismissed", submitted_at: AT }], AT)).toBeNull();
  });

  it("maps a comment, merge, close, reopen, push, label, assign, ready, draft, review_requested, mention", () => {
    expect(selectPrEvent([ev("commented", AT)], AT)?.kind).toBe("commented");
    expect(selectPrEvent([ev("merged", AT)], AT)?.kind).toBe("merged");
    expect(selectPrEvent([ev("closed", AT)], AT)?.kind).toBe("closed");
    expect(selectPrEvent([ev("reopened", AT)], AT)?.kind).toBe("reopened");
    expect(selectPrEvent([{ event: "committed", committer: { date: AT } }], AT)?.kind).toBe("committed");
    expect(selectPrEvent([ev("head_ref_force_pushed", AT)], AT)?.kind).toBe("committed");
    expect(selectPrEvent([ev("labeled", AT)], AT)?.kind).toBe("labeled");
    expect(selectPrEvent([ev("assigned", AT)], AT)?.kind).toBe("assigned");
    expect(selectPrEvent([ev("ready_for_review", AT)], AT)?.kind).toBe("ready_for_review");
    expect(selectPrEvent([ev("convert_to_draft", AT)], AT)?.kind).toBe("converted_to_draft");
    expect(selectPrEvent([ev("review_requested", AT)], AT)?.kind).toBe("review_requested");
    expect(selectPrEvent([ev("mentioned", AT)], AT)?.kind).toBe("mentioned");
  });

  it("ignores unknown event types", () => {
    expect(selectPrEvent([ev("renamed", AT), ev("milestoned", AT)], AT)).toBeNull();
  });

  it("picks the latest event at or before the notification time", () => {
    const raw = [ev("labeled", "2026-06-17T09:00:00Z"), ev("commented", "2026-06-17T09:59:59Z")];
    expect(selectPrEvent(raw, AT)?.kind).toBe("commented");
  });

  it("ignores events after the notification time (+skew)", () => {
    // A comment 1 minute after the notification is a later, unrelated event.
    const raw = [ev("merged", AT), ev("commented", "2026-06-17T10:01:00Z")];
    expect(selectPrEvent(raw, AT)?.kind).toBe("merged");
  });

  it("breaks ties on the same timestamp by priority (reviewed > merged > commented)", () => {
    const raw = [ev("commented", AT), ev("merged", AT), { event: "reviewed", state: "approved", submitted_at: AT }];
    expect(selectPrEvent(raw, AT)?.kind).toBe("approved");
  });

  it("returns null for an empty timeline", () => {
    expect(selectPrEvent([], AT)).toBeNull();
  });

  it("maps a line-commented event to commented and an unlabeled event to labeled", () => {
    expect(selectPrEvent([ev("line-commented", AT)], AT)?.kind).toBe("commented");
    expect(selectPrEvent([ev("unlabeled", AT)], AT)?.kind).toBe("labeled");
  });

  it("captures the reviewer login (from `user`) as `by`", () => {
    const raw = [{ event: "reviewed", state: "approved", submitted_at: AT, user: { login: "octocat" } }];
    expect(selectPrEvent(raw, AT)).toEqual({ kind: "approved", at: AT, by: "octocat" });
  });

  it("captures the actor login (from `actor`) as `by` for non-review events", () => {
    expect(selectPrEvent([ev("merged", AT, { actor: { login: "khalil376" } })], AT)?.by).toBe("khalil376");
  });

  it("omits `by` when GitHub attributes no actor (e.g. a commit)", () => {
    const res = selectPrEvent([{ event: "committed", committer: { date: AT } }], AT);
    expect(res).toEqual({ kind: "committed", at: AT }); // no `by` key at all
  });
});

function fakeFetch(pages: { status: number; body: unknown; link?: string | null }[]): FetchLike {
  let i = 0;
  return async () => {
    const p = pages[Math.min(i++, pages.length - 1)];
    return {
      status: p.status,
      ok: p.status < 400,
      headers: { get: (n: string) => (n.toLowerCase() === "link" ? p.link ?? null : null) },
      json: async () => p.body,
      text: async () => JSON.stringify(p.body),
    };
  };
}

describe("fetchPrEvent", () => {
  it("classifies from a single-page timeline", async () => {
    const f = fakeFetch([{ status: 200, body: [{ event: "merged", created_at: AT }] }]);
    expect(await fetchPrEvent("tok", "acme/repo", 42, AT, f)).toEqual({ kind: "merged", at: AT });
  });

  it("follows the Link rel=last header to the final page", async () => {
    const f = fakeFetch([
      { status: 200, body: [{ event: "labeled", created_at: "2026-06-01T00:00:00Z" }],
        link: '<https://api.github.com/repositories/1/issues/42/timeline?per_page=100&page=3>; rel="last"' },
      { status: 200, body: [{ event: "merged", created_at: AT }] },
    ]);
    expect((await fetchPrEvent("tok", "acme/repo", 42, AT, f))?.kind).toBe("merged");
  });

  it("returns null on a non-200 timeline response", async () => {
    expect(await fetchPrEvent("tok", "acme/repo", 42, AT, fakeFetch([{ status: 404, body: null }]))).toBeNull();
  });

  it("does not follow a second page when the Link header lacks rel=last", async () => {
    const f = fakeFetch([
      { status: 200, body: [{ event: "merged", created_at: AT }],
        link: '<https://api.github.com/repositories/1/issues/42/timeline?per_page=100&page=1>; rel="first"' },
      { status: 200, body: [{ event: "closed", created_at: AT }] }, // would be picked if a second page were fetched
    ]);
    expect((await fetchPrEvent("tok", "acme/repo", 42, AT, f))?.kind).toBe("merged");
  });

  it("requests the issues timeline endpoint with per_page=100 and a bearer token", async () => {
    let url = ""; let auth: string | undefined;
    const f: FetchLike = async (u, init) => {
      url = u; auth = init?.headers?.authorization;
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => [], text: async () => "[]" };
    };
    await fetchPrEvent("tok", "acme/repo", 42, AT, f);
    expect(url).toBe("https://api.github.com/repos/acme/repo/issues/42/timeline?per_page=100");
    expect(auth).toBe("Bearer tok");
  });
});
