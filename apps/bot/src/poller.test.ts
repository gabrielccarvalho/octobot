import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createDatabase, type Database, type User } from "./db";
import {
  pollUser,
  startPoller,
  nextPollDelayMs,
  POLL_BACKOFF_CAP_MS,
  POLL_FAILURE_ALERT_THRESHOLD,
  type PollerDeps,
} from "./poller";
import type { FetchResult } from "./github/notifications";
import type { DmSender, OctoMessage } from "./notifier";
import type { PrEvent } from "./github/timeline";
import type { ChecksVerdict } from "./github/checks";
import { ssoWarnedMetaValue } from "./github/sso";

let db: Database;
let sent: { discordId: string; message: OctoMessage }[];
let sender: DmSender;
let nextResult: FetchResult;
let nextEvent: PrEvent | null;
let nextChecks: ChecksVerdict | null;

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
    fetchPrEvent: async () => nextEvent,
    fetchChecksVerdict: async () => nextChecks,
  };
}

beforeEach(() => {
  db = createDatabase(":memory:");
  db.upsertUser("d1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
  db.updateLastModified("d1", "Mon");
  sent = [];
  sender = { sendDm: async (discordId, message) => { sent.push({ discordId, message }); } };
  nextEvent = null;
  nextChecks = null;
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
  expect(sent[0].message.tone).toBe("broken");
  expect(sent[0].message.body).toMatch(/reconnect|expired|revoked/i);
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
    fetchPrEvent: async () => null,
    fetchChecksVerdict: async () => null,
  };
  await pollUser(localDeps, fresh.getUser("d2")!);
  expect(fetchNotifications).not.toHaveBeenCalled();
  expect(sent).toHaveLength(0);
});

it("renders the classified event in the DM", async () => {
  nextResult = { status: 200, items: [prItem], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: [] };
  nextEvent = { kind: "approved", at: prItem.updatedAt };
  await pollUser(deps(), user());
  expect(sent[0].message.title).toContain("Your PR was approved");
});

it("falls back to a CI verdict when the timeline yields no event", async () => {
  nextResult = { status: 200, items: [{ ...prItem, reason: "ci_activity" }], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: [] };
  nextEvent = null;
  nextChecks = "failed";
  await pollUser(deps(), user());
  expect(sent[0].message.title).toContain("CI failed on your PR");
});

it("does not probe CI for an unmapped non-CI reason when the timeline yields no event", async () => {
  nextResult = { status: 200, items: [prItem], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: [] };
  nextEvent = null;
  nextChecks = "passed";
  const d = deps();
  d.fetchChecksVerdict = vi.fn(async () => nextChecks);
  await pollUser(d, user());
  expect(d.fetchChecksVerdict).not.toHaveBeenCalled();
  expect(sent[0].message.title).not.toContain("CI passed");
  expect(sent[0].message.title).not.toContain("CI failed");
  expect(sent[0].message.title).toContain("Review requested"); // prItem.reason fallback
});

it("still delivers the notification when enrichment throws", async () => {
  nextResult = { status: 200, items: [prItem], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: [] };
  const d = deps();
  d.fetchPrEvent = async () => { throw new Error("boom"); };
  await pollUser(d, user());
  expect(sent).toHaveLength(1);
  expect(sent[0].message.title).toContain("Review requested"); // prItem.reason fallback, DM not dropped
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
    expect(sent[0].message.body).toMatch(/SAML SSO/);
    expect(sent[0].message.body).toContain("2 SAML SSO organizations");
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

  it("stays quiet on the first tick when onboarding already seeded the meta key for the same org set", async () => {
    // Mirrors what createOnConnect does: seed the gate via the same shared
    // helper the poller uses, before the poller ever sees this user.
    db.setMeta(ssoKey, ssoWarnedMetaValue(["111", "222"]));
    nextResult = { status: 200, items: [], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: ["222", "111"] };
    await pollUser(deps(), user());
    expect(sent).toHaveLength(0);
  });

  it("a throwing sendDm leaves the meta key unset and still processes notifications", async () => {
    nextResult = { status: 200, items: [prItem], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: ["111"] };
    const d = deps();
    d.sender = {
      sendDm: async (discordId, message) => {
        if (message.body.includes("SAML SSO")) throw new Error("dm failed");
        sent.push({ discordId, message });
      },
    };
    await pollUser(d, user());
    expect(db.getMeta(ssoKey)).toBeNull();
    expect(sent).toHaveLength(1); // the PR notification still went out
    expect(db.wasNotified("d1", "t1", prItem.updatedAt)).toBe(true);
  });
});

describe("poll-failure alert", () => {
  const fail = (): FetchResult => ({ status: 503, items: [], lastModified: null, pollInterval: 60, ssoPartialOrgIds: [] });
  const ok = (): FetchResult => ({ status: 200, items: [], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: [] });

  it("does not advance the watermark on a failure", async () => {
    nextResult = fail();
    await pollUser(deps(), user());
    expect(db.getUser("d1")!.lastModified).toBe("Mon"); // unchanged; thread will replay after recovery
  });

  it("warns exactly once, on the tick the streak crosses the threshold", async () => {
    nextResult = fail();
    for (let i = 0; i < POLL_FAILURE_ALERT_THRESHOLD - 1; i++) {
      await pollUser(deps(), user());
      expect(sent).toHaveLength(0); // still quiet below the threshold
    }
    await pollUser(deps(), user()); // crosses
    expect(sent).toHaveLength(1);
    expect(sent[0].message.title).toMatch(/Can't reach/i);
    expect(sent[0].message.body).not.toMatch(/reconnect|expired|revoked/i); // token is fine, no action needed

    await pollUser(deps(), user()); // further failures stay silent
    await pollUser(deps(), user());
    expect(sent).toHaveLength(1);
  });

  it("resets the streak on a success, so a later outage warns again", async () => {
    nextResult = fail();
    for (let i = 0; i < POLL_FAILURE_ALERT_THRESHOLD; i++) await pollUser(deps(), user());
    expect(sent).toHaveLength(1);

    nextResult = ok(); // recovery clears the streak
    await pollUser(deps(), user());

    nextResult = fail(); // a fresh outage must climb the full threshold again
    for (let i = 0; i < POLL_FAILURE_ALERT_THRESHOLD - 1; i++) await pollUser(deps(), user());
    expect(sent).toHaveLength(1);
    await pollUser(deps(), user());
    expect(sent).toHaveLength(2);
  });

  it("clears the streak on a 304 too", async () => {
    nextResult = fail();
    await pollUser(deps(), user());
    expect(db.getMeta("poll_fail:d1")).toBe("1");
    nextResult = { status: 304, items: [], lastModified: null, pollInterval: 60, ssoPartialOrgIds: [] };
    await pollUser(deps(), user());
    expect(db.getMeta("poll_fail:d1")).toBe("");
  });
});

describe("nextPollDelayMs", () => {
  it("uses the base interval when healthy", () => {
    expect(nextPollDelayMs(0, 0, 60_000)).toBe(60_000);
  });

  it("never polls faster than GitHub's requested x-poll-interval floor", () => {
    expect(nextPollDelayMs(0, 90, 60_000)).toBe(90_000); // 90s floor beats the 60s base
  });

  it("adds no extra delay on the first failed tick", () => {
    expect(nextPollDelayMs(1, 0, 60_000)).toBe(60_000);
  });

  it("backs off exponentially on sustained failure", () => {
    expect(nextPollDelayMs(2, 0, 60_000)).toBe(120_000);
    expect(nextPollDelayMs(3, 0, 60_000)).toBe(240_000);
    expect(nextPollDelayMs(4, 0, 60_000)).toBe(480_000);
  });

  it("caps the backoff", () => {
    expect(nextPollDelayMs(20, 0, 60_000)).toBe(POLL_BACKOFF_CAP_MS);
  });
});

describe("startPoller", () => {
  afterEach(() => vi.useRealTimers());

  it("polls immediately, reschedules, and stops cleanly", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const d: PollerDeps = {
      ...deps(),
      fetchNotifications: async () => {
        calls++;
        return { status: 200, items: [], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: [] };
      },
    };
    const poller = startPoller(d, 60_000);
    await vi.advanceTimersByTimeAsync(0); // flush the immediate tick
    expect(calls).toBe(1);

    await vi.advanceTimersByTimeAsync(60_000); // next scheduled tick fires
    expect(calls).toBe(2);

    poller.stop();
    await vi.advanceTimersByTimeAsync(120_000); // no further ticks after stop
    expect(calls).toBe(2);
  });
});
