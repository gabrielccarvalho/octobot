import { it, expect, beforeEach, describe, vi } from "vitest";
import { createDatabase, type Database } from "./db";
import { createOnConnect } from "./onboarding";
import type { FetchResult } from "./github/notifications";
import type { PrSummary } from "./github/search";
import type { DmSender } from "./notifier";

let db: Database;
let sent: { discordId: string; message: string }[];
let sender: DmSender;

function pr(n: number): PrSummary {
  return {
    repoFullName: "acme/repo",
    number: n,
    title: `PR ${n}`,
    url: `https://github.com/acme/repo/pull/${n}`,
    updatedAt: "2026-06-17T10:00:00Z",
  };
}

function deps(over: {
  fetchResult?: FetchResult | (() => Promise<FetchResult>);
  search?: PrSummary[];
  ssoPartialOrgIds?: Record<string, string[]>;
} = {}) {
  const fetchResult =
    over.fetchResult ??
    ({ status: 200, items: [], lastModified: "Mon, 01 Jan 2026 00:00:00 GMT", pollInterval: 60, ssoPartialOrgIds: [] } as FetchResult);
  const sso = over.ssoPartialOrgIds ?? {};
  return {
    db,
    sender,
    fetchNotifications: vi.fn(async () =>
      typeof fetchResult === "function" ? await (fetchResult as () => Promise<FetchResult>)() : fetchResult
    ),
    searchPullRequests: vi.fn(async (_token: string, query: string) => ({
      prs: over.search ?? [],
      ssoPartialOrgIds: sso[query] ?? [],
    })),
    awaitingQuery: "AWAIT",
    fetchMinePrs: vi.fn(async () => ({
      prs: over.search ?? [],
      ssoPartialOrgIds: sso["MINE"] ?? [],
    })),
  };
}

beforeEach(() => {
  db = createDatabase(":memory:");
  db.upsertUser("d1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
  sent = [];
  sender = { sendDm: async (discordId, message) => { sent.push({ discordId, message }); } };
});

it("baselines current threads, sets the watermark, and sends one summary DM", async () => {
  const d = deps({
    fetchResult: {
      status: 200,
      items: [
        { threadId: "t1", reason: "review_requested", updatedAt: "U1", repoFullName: "acme/repo", subjectType: "PullRequest", subjectNumber: 1, subjectTitle: "x", subjectUrl: "u" },
      ],
      lastModified: "Mon, 01 Jan 2026 00:00:00 GMT",
      pollInterval: 60,
      ssoPartialOrgIds: [],
    } as FetchResult,
    search: [pr(7)],
  });
  const onConnect = createOnConnect(d);
  await onConnect("d1", "tok", "octocat");

  expect(db.wasNotified("d1", "t1", "U1")).toBe(true);
  expect(db.getUser("d1")?.lastModified).toBe("Mon, 01 Jan 2026 00:00:00 GMT");
  expect(sent).toHaveLength(1);
  expect(sent[0].discordId).toBe("d1");
  expect(sent[0].message).toContain("✅ Connected as `octocat`");
  expect(d.searchPullRequests).toHaveBeenCalledTimes(1);
  expect(d.fetchMinePrs).toHaveBeenCalledTimes(1);
});

it("still sets a watermark when the baseline fetch fails", async () => {
  const d = deps({ fetchResult: async () => { throw new Error("network"); } });
  const onConnect = createOnConnect(d);
  await onConnect("d1", "tok", "octocat");
  expect(db.getUser("d1")?.lastModified).toBeTruthy();
  expect(sent).toHaveLength(1);
});

it("appends the SSO warning, unioning and deduping org IDs from both searches", async () => {
  const d = deps({
    search: [pr(7)],
    ssoPartialOrgIds: { AWAIT: ["21955855", "20582480"], MINE: ["20582480", "999"] },
  });
  const onConnect = createOnConnect(d);
  await onConnect("d1", "tok", "octocat");
  expect(sent).toHaveLength(1);
  expect(sent[0].message).toContain("your token isn't authorized for 3 SAML SSO organizations.");
});

it("renders byte-identically to today when ssoPartialOrgIds is empty", async () => {
  const d = deps({ search: [pr(7)] });
  const onConnect = createOnConnect(d);
  await onConnect("d1", "tok", "octocat");
  expect(sent[0].message).not.toContain("⚠️");
});

describe("seeding the poller's warn-once gate", () => {
  it("seeds sso_warned from the baseline fetch's SSO org IDs, so the poller's first tick stays quiet", async () => {
    const d = deps({
      fetchResult: {
        status: 200,
        items: [],
        lastModified: "Mon, 01 Jan 2026 00:00:00 GMT",
        pollInterval: 60,
        ssoPartialOrgIds: ["222", "111"],
      } as FetchResult,
      search: [pr(7)],
    });
    const onConnect = createOnConnect(d);
    await onConnect("d1", "tok", "octocat");
    expect(db.getMeta("sso_warned:d1")).toBe("111,222"); // sorted, matches poller's format
  });

  it("does not seed sso_warned when the baseline fetch reports no SSO org IDs", async () => {
    const d = deps({
      fetchResult: {
        status: 200,
        items: [],
        lastModified: "Mon, 01 Jan 2026 00:00:00 GMT",
        pollInterval: 60,
        ssoPartialOrgIds: [],
      } as FetchResult,
      search: [pr(7)],
    });
    const onConnect = createOnConnect(d);
    await onConnect("d1", "tok", "octocat");
    expect(db.getMeta("sso_warned:d1")).toBeNull();
  });

  it("does not seed sso_warned when the baseline fetch fails (falls through to the now() watermark)", async () => {
    const d = deps({ fetchResult: async () => { throw new Error("network"); } });
    const onConnect = createOnConnect(d);
    await onConnect("d1", "tok", "octocat");
    expect(db.getMeta("sso_warned:d1")).toBeNull();
  });
});
