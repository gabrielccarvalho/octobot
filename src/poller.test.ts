import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDatabase, type Database, type User } from "./db";
import { pollUser, type PollerDeps } from "./poller";
import type { FetchResult } from "./github/notifications";
import type { DmSender } from "./notifier";
import type { LatestReview } from "./github/reviews";

let db: Database;
let sent: { discordId: string; message: string }[];
let sender: DmSender;
let nextResult: FetchResult;
let nextReview: LatestReview | null;

const prItem = {
  threadId: "t1",
  reason: "review_requested",
  updatedAt: "2026-06-17T10:00:00Z",
  repoFullName: "acme/repo",
  prNumber: 1,
  prTitle: "Fix",
  prUrl: "https://github.com/acme/repo/pull/1",
};

function user(): User {
  return db.getUser("d1")!;
}
function deps(): PollerDeps {
  return {
    db,
    sender,
    decryptToken: () => "tok",
    fetchNotifications: async () => nextResult,
    fetchLatestReview: async () => nextReview,
  };
}

beforeEach(() => {
  db = createDatabase(":memory:");
  db.upsertUser("d1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
  db.updateLastModified("d1", "Mon");
  sent = [];
  sender = { sendDm: async (discordId, message) => { sent.push({ discordId, message }); } };
  nextReview = null;
});

it("DMs a new PR notification and marks it", async () => {
  nextResult = { status: 200, items: [prItem], lastModified: "Mon", pollInterval: 60 };
  await pollUser(deps(), user());
  expect(sent).toHaveLength(1);
  expect(sent[0].discordId).toBe("d1");
  expect(db.wasNotified("d1", "t1", prItem.updatedAt)).toBe(true);
});

it("does not re-DM the same thread + updatedAt", async () => {
  nextResult = { status: 200, items: [prItem], lastModified: null, pollInterval: 60 };
  await pollUser(deps(), user());
  await pollUser(deps(), user());
  expect(sent).toHaveLength(1);
});

it("re-DMs when updatedAt changes", async () => {
  nextResult = { status: 200, items: [prItem], lastModified: null, pollInterval: 60 };
  await pollUser(deps(), user());
  nextResult = { status: 200, items: [{ ...prItem, updatedAt: "2026-07-01T00:00:00Z" }], lastModified: null, pollInterval: 60 };
  await pollUser(deps(), user());
  expect(sent).toHaveLength(2);
});

it("ignores a 304", async () => {
  nextResult = { status: 304, items: [], lastModified: null, pollInterval: 60 };
  await pollUser(deps(), user());
  expect(sent).toHaveLength(0);
});

it("on 401 sends a reconnect notice and deletes the user", async () => {
  nextResult = { status: 401, items: [], lastModified: null, pollInterval: 60 };
  await pollUser(deps(), user());
  expect(sent).toHaveLength(1);
  expect(sent[0].message).toMatch(/reconnect|expired|revoked/i);
  expect(db.getUser("d1")).toBeNull();
});

it("does not mark notified when the DM fails", async () => {
  nextResult = { status: 200, items: [prItem], lastModified: null, pollInterval: 60 };
  const failing: PollerDeps = { ...deps(), sender: { sendDm: vi.fn(async () => { throw new Error("closed"); }) } };
  await pollUser(failing, user());
  expect(db.wasNotified("d1", "t1", prItem.updatedAt)).toBe(false);
});

it("skips a user that has no baseline (null lastModified)", async () => {
  const fresh = createDatabase(":memory:");
  fresh.upsertUser("d2", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
  const fetchNotifications = vi.fn(); // intentionally never called; guard returns first
  const localDeps: PollerDeps = {
    db: fresh,
    sender,
    decryptToken: () => "tok",
    fetchNotifications,
    fetchLatestReview: async () => null,
  };
  await pollUser(localDeps, fresh.getUser("d2")!);
  expect(fetchNotifications).not.toHaveBeenCalled();
  expect(sent).toHaveLength(0);
});

it("renders the fetched verdict in the DM", async () => {
  nextResult = { status: 200, items: [prItem], lastModified: "Mon", pollInterval: 60 };
  nextReview = { state: "APPROVED", submittedAt: prItem.updatedAt };
  await pollUser(deps(), user());
  expect(sent[0].message).toContain("Your PR was approved");
});

it("falls back to the generic label when the review lookup throws", async () => {
  nextResult = { status: 200, items: [prItem], lastModified: "Mon", pollInterval: 60 };
  const d = deps();
  d.fetchLatestReview = async () => { throw new Error("boom"); };
  await pollUser(d, user());
  expect(sent).toHaveLength(1);
  expect(sent[0].message).toContain("Review requested"); // prItem.reason fallback, DM not dropped
});
