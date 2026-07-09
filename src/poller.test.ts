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
  subjectType: "PullRequest",
  subjectNumber: 1,
  subjectTitle: "Fix",
  subjectUrl: "https://github.com/acme/repo/pull/1",
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
  nextResult = { status: 200, items: [prItem], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: [] };
  await pollUser(deps(), user());
  expect(sent).toHaveLength(1);
  expect(sent[0].discordId).toBe("d1");
  expect(db.wasNotified("d1", "t1", prItem.updatedAt)).toBe(true);
});

it("does not re-DM the same thread + updatedAt", async () => {
  nextResult = { status: 200, items: [prItem], lastModified: null, pollInterval: 60, ssoPartialOrgIds: [] };
  await pollUser(deps(), user());
  await pollUser(deps(), user());
  expect(sent).toHaveLength(1);
});

it("re-DMs when updatedAt changes", async () => {
  nextResult = { status: 200, items: [prItem], lastModified: null, pollInterval: 60, ssoPartialOrgIds: [] };
  await pollUser(deps(), user());
  nextResult = { status: 200, items: [{ ...prItem, updatedAt: "2026-07-01T00:00:00Z" }], lastModified: null, pollInterval: 60, ssoPartialOrgIds: [] };
  await pollUser(deps(), user());
  expect(sent).toHaveLength(2);
});

it("ignores a 304", async () => {
  nextResult = { status: 304, items: [], lastModified: null, pollInterval: 60, ssoPartialOrgIds: [] };
  await pollUser(deps(), user());
  expect(sent).toHaveLength(0);
});

it("on 401 sends a reconnect notice and deletes the user", async () => {
  nextResult = { status: 401, items: [], lastModified: null, pollInterval: 60, ssoPartialOrgIds: [] };
  await pollUser(deps(), user());
  expect(sent).toHaveLength(1);
  expect(sent[0].message).toMatch(/reconnect|expired|revoked/i);
  expect(db.getUser("d1")).toBeNull();
});

it("does not mark notified when the DM fails", async () => {
  nextResult = { status: 200, items: [prItem], lastModified: null, pollInterval: 60, ssoPartialOrgIds: [] };
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
  nextResult = { status: 200, items: [prItem], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: [] };
  nextReview = { state: "APPROVED", submittedAt: prItem.updatedAt };
  await pollUser(deps(), user());
  expect(sent[0].message).toContain("Your PR was approved");
});

it("falls back to the generic label when the review lookup throws", async () => {
  nextResult = { status: 200, items: [prItem], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: [] };
  const d = deps();
  d.fetchLatestReview = async () => { throw new Error("boom"); };
  await pollUser(d, user());
  expect(sent).toHaveLength(1);
  expect(sent[0].message).toContain("Review requested"); // prItem.reason fallback, DM not dropped
});

const issueItem = {
  threadId: "t9",
  reason: "mention",
  updatedAt: "2026-06-17T11:00:00Z",
  repoFullName: "acme/repo",
  subjectType: "Issue",
  subjectNumber: 9,
  subjectTitle: "Bug",
  subjectUrl: "https://github.com/acme/repo/issues/9",
};

it("suppresses a non-PR subject by default", async () => {
  nextResult = { status: 200, items: [issueItem], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: [] };
  await pollUser(deps(), user());
  expect(sent).toHaveLength(0);
});

it("delivers a subject once the user subscribes to that type", async () => {
  db.setSubscribedSubjects("d1", ["PullRequest", "Issue"]);
  nextResult = { status: 200, items: [issueItem], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: [] };
  await pollUser(deps(), user());
  expect(sent).toHaveLength(1);
});

it("suppresses a reason the user has filtered out", async () => {
  db.setSubscribedReasons("d1", ["mention"]); // review_requested no longer allowed
  nextResult = { status: 200, items: [prItem], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: [] };
  await pollUser(deps(), user());
  expect(sent).toHaveLength(0);
});

describe("SSO partial-results warning", () => {
  const ssoKey = "sso_warned:d1";

  it("warns once on first sight of a filtered org set", async () => {
    nextResult = { status: 200, items: [], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: ["222", "111"] };
    await pollUser(deps(), user());
    expect(sent).toHaveLength(1);
    expect(sent[0].message).toMatch(/SAML SSO/);
    expect(sent[0].message).toContain("2 SAML SSO organizations");
    expect(db.getMeta(ssoKey)).toBe("111,222"); // sorted, dedupe-key only
  });

  it("does not warn again next tick with the same org set", async () => {
    nextResult = { status: 200, items: [], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: ["111", "222"] };
    await pollUser(deps(), user());
    await pollUser(deps(), user());
    expect(sent).toHaveLength(1);
  });

  it("warns again when the org set changes", async () => {
    nextResult = { status: 200, items: [], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: ["111"] };
    await pollUser(deps(), user());
    nextResult = { status: 200, items: [], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: ["111", "333"] };
    await pollUser(deps(), user());
    expect(sent).toHaveLength(2);
  });

  it("does not warn when the org set is empty", async () => {
    nextResult = { status: 200, items: [], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: [] };
    await pollUser(deps(), user());
    expect(sent).toHaveLength(0);
    expect(db.getMeta(ssoKey)).toBeNull();
  });

  it("clears the meta key when filtering stops, so a later loss of authorization warns again", async () => {
    nextResult = { status: 200, items: [], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: ["111"] };
    await pollUser(deps(), user());
    expect(db.getMeta(ssoKey)).toBe("111");

    nextResult = { status: 200, items: [], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: [] };
    await pollUser(deps(), user());
    expect(db.getMeta(ssoKey)).toBe("");

    nextResult = { status: 200, items: [], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: ["111"] };
    await pollUser(deps(), user());
    expect(sent).toHaveLength(2); // warned again after the reset
  });

  it("a throwing sendDm leaves the meta key unset and still processes notifications", async () => {
    nextResult = { status: 200, items: [prItem], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: ["111"] };
    const d = deps();
    d.sender = {
      sendDm: async (discordId, message) => {
        if (message.includes("SAML SSO")) throw new Error("dm failed");
        sent.push({ discordId, message });
      },
    };
    await pollUser(d, user());
    expect(db.getMeta(ssoKey)).toBeNull();
    expect(sent).toHaveLength(1); // the PR notification still went out
    expect(db.wasNotified("d1", "t1", prItem.updatedAt)).toBe(true);
  });
});
