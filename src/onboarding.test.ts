import { describe, it, expect, beforeEach, vi } from "vitest";
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
} = {}) {
  const fetchResult =
    over.fetchResult ??
    ({ status: 200, items: [], lastModified: "Mon, 01 Jan 2026 00:00:00 GMT", pollInterval: 60 } as FetchResult);
  return {
    db,
    sender,
    fetchNotifications: vi.fn(async () =>
      typeof fetchResult === "function" ? await (fetchResult as () => Promise<FetchResult>)() : fetchResult
    ),
    searchPullRequests: vi.fn(async () => over.search ?? []),
    awaitingQuery: "AWAIT",
    minePrsQuery: "MINE",
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
        { threadId: "t1", reason: "review_requested", updatedAt: "U1", repoFullName: "acme/repo", prNumber: 1, prTitle: "x", prUrl: "u" },
      ],
      lastModified: "Mon, 01 Jan 2026 00:00:00 GMT",
      pollInterval: 60,
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
  expect(d.searchPullRequests).toHaveBeenCalledTimes(2);
});

it("still sets a watermark when the baseline fetch fails", async () => {
  const d = deps({ fetchResult: async () => { throw new Error("network"); } });
  const onConnect = createOnConnect(d);
  await onConnect("d1", "tok", "octocat");
  expect(db.getUser("d1")?.lastModified).toBeTruthy();
  expect(sent).toHaveLength(1);
});
