import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDatabase, type Database } from "../db";
import {
  handleLink,
  handleUnlink,
  handleStatus,
  type CommandContext,
  type LinkDeps,
  type StatusDeps,
  type AttentionList,
} from "./handlers";
import type { PrSummary } from "../github/search";

let db: Database;
let replies: string[];

const linkDeps: LinkDeps = {
  generateState: () => "test-state",
  authorizeUrl: (state) => `https://github.com/login/oauth/authorize?state=${state}`,
};

function ctx(userId = "user1"): CommandContext {
  return { userId, guildId: "g1", getOption: () => null, reply: async (m) => { replies.push(m); } };
}

function pr(n: number, title = "Title"): PrSummary {
  return {
    repoFullName: "acme/repo",
    number: n,
    title,
    url: `https://github.com/acme/repo/pull/${n}`,
    updatedAt: "2026-06-17T10:00:00Z",
  };
}

function statusDeps(list: AttentionList): StatusDeps {
  return { listAttention: async () => list };
}

beforeEach(() => {
  db = createDatabase(":memory:");
  replies = [];
});

describe("/link", () => {
  it("stores a state and replies with an authorize URL", async () => {
    await handleLink(ctx(), db, linkDeps);
    expect(replies[0]).toContain("https://github.com/login/oauth/authorize?state=test-state");
    expect(db.consumeState("test-state", 60_000)).toBe("user1");
  });
});

describe("/unlink", () => {
  it("removes an existing connection", async () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    await handleUnlink(ctx(), db);
    expect(db.getUser("user1")).toBeNull();
    expect(replies[0]).toMatch(/disconnected/i);
  });

  it("reports when not connected", async () => {
    await handleUnlink(ctx(), db);
    expect(replies[0]).toMatch(/not connected/i);
  });
});

describe("/status", () => {
  it("tells unconnected users to /link and does not call the API", async () => {
    const listAttention = vi.fn();
    await handleStatus(ctx(), db, { listAttention });
    expect(replies[0]).toMatch(/not connected/i);
    expect(listAttention).not.toHaveBeenCalled();
  });

  it("shows the login and both sections with items", async () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    await handleStatus(
      ctx(),
      db,
      statusDeps({ incoming: [pr(7, "Fix bug")], mine: [pr(9, "My feature")] })
    );
    const msg = replies[0];
    expect(msg).toContain("octocat");
    expect(msg).toContain("Awaiting your review");
    expect(msg).toContain("[acme/repo #7 Fix bug](https://github.com/acme/repo/pull/7)");
    expect(msg).toContain("Your PRs awaiting review");
    expect(msg).toContain("[acme/repo #9 My feature](https://github.com/acme/repo/pull/9)");
  });

  it("shows friendly empty-state lines when sections are empty", async () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    await handleStatus(ctx(), db, statusDeps({ incoming: [], mine: [] }));
    expect(replies[0]).toMatch(/Nothing awaiting your review/i);
    expect(replies[0]).toMatch(/No open PRs of yours/i);
  });

  it("caps a section at 10 and notes the remainder", async () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    const many = Array.from({ length: 13 }, (_, i) => pr(i + 1));
    await handleStatus(ctx(), db, statusDeps({ incoming: many, mine: [] }));
    const itemLines = replies[0].split("\n").filter((l) => l.startsWith("• "));
    expect(itemLines).toHaveLength(10);
    expect(replies[0]).toContain("…and 3 more");
  });

  it("clamps the reply to Discord's 2000-character limit", async () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    const longTitle = "x".repeat(70);
    const incoming = Array.from({ length: 10 }, (_, i) => pr(i + 1, longTitle));
    const mine = Array.from({ length: 10 }, (_, i) => pr(i + 100, longTitle));
    await handleStatus(ctx(), db, statusDeps({ incoming, mine }));
    expect(replies[0].length).toBeLessThanOrEqual(2000);
  });

  it("asks to reconnect on a 401 error", async () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    const deps: StatusDeps = {
      listAttention: async () => {
        throw Object.assign(new Error("401"), { status: 401 });
      },
    };
    await handleStatus(ctx(), db, deps);
    expect(replies[0]).toMatch(/expired|reconnect|\/link/i);
  });

  it("shows a generic error on other failures", async () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    const deps: StatusDeps = {
      listAttention: async () => {
        throw new Error("boom");
      },
    };
    await handleStatus(ctx(), db, deps);
    expect(replies[0]).toMatch(/try again/i);
  });
});
