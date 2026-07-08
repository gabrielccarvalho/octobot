import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDatabase, type Database } from "../db";
import {
  handleLink,
  handleUnlink,
  handleStatus,
  subjectOptions,
  reasonOptions,
  applySubjectSelection,
  applyReasonSelection,
  toggleDigest,
  digestStatusText,
  handleTokenSubmit,
  CONNECT_TOKEN_CREATE_URL,
  type CommandContext,
  type LinkDeps,
  type StatusDeps,
} from "./handlers";
import type { AttentionList } from "../status";
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

const UPDATED_AT = "2026-06-17T10:00:00Z";

function pr(n: number, title = "Title", repo = "acme/repo"): PrSummary {
  return {
    repoFullName: repo,
    number: n,
    title,
    url: `https://github.com/${repo}/pull/${n}`,
    updatedAt: UPDATED_AT,
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

  it("renders the connected summary via the shared formatter", async () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    await handleStatus(ctx(), db, statusDeps({ incoming: [pr(7, "Fix bug")], mine: [] }));
    expect(replies[0]).toContain("✅ Connected as `octocat`");
    expect(replies[0]).toContain("**acme/repo**");
    expect(replies[0]).toContain("#7 [Fix bug](https://github.com/acme/repo/pull/7)");
  });

  it("tells an oauth user to run /link on a 401 error", async () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" }, "oauth");
    const deps: StatusDeps = {
      listAttention: async () => {
        throw Object.assign(new Error("401"), { status: 401 });
      },
    };
    await handleStatus(ctx(), db, deps);
    expect(replies[0]).toMatch(/expired|reconnect/i);
    expect(replies[0]).toContain("/link");
  });

  it("tells a pat user to run /connect-token on a 401 error", async () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" }, "pat");
    const deps: StatusDeps = {
      listAttention: async () => {
        throw Object.assign(new Error("401"), { status: 401 });
      },
    };
    await handleStatus(ctx(), db, deps);
    expect(replies[0]).toMatch(/expired|reconnect/i);
    expect(replies[0]).toContain("/connect-token");
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

describe("/digest", () => {
  it("toggles the digest flag and returns the new state", () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    expect(db.getDigestEnabled("user1")).toBe(true);
    expect(toggleDigest(db, "user1")).toBe(false);
    expect(db.getDigestEnabled("user1")).toBe(false);
    expect(toggleDigest(db, "user1")).toBe(true);
  });

  it("describes the current state", () => {
    expect(digestStatusText(true)).toMatch(/on/i);
    expect(digestStatusText(false)).toMatch(/off/i);
  });
});

function tokenDb() {
  const calls: any = { upsert: null };
  const db = {
    upsertUser: (discordId: string, login: string, enc: any, authSource?: string) => {
      calls.upsert = { discordId, login, enc, authSource };
    },
  } as any;
  return { db, calls };
}

const okDeps = (overrides: any = {}) => ({
  validateToken: async () => ({ login: "octocat", scopes: ["repo", "notifications"] }),
  encrypt: () => ({ ciphertext: "c", iv: "i", tag: "t" }),
  onConnect: async () => {},
  ...overrides,
});

describe("handleTokenSubmit", () => {
  it("stores the token as pat and confirms on success", async () => {
    const { db, calls } = tokenDb();
    const out = await handleTokenSubmit("d1", "  ghp_valid  ", db, okDeps() as any);
    expect(calls.upsert.authSource).toBe("pat");
    expect(calls.upsert.login).toBe("octocat");
    expect(out).toContain("octocat");
  });

  it("rejects an invalid token (401) without storing", async () => {
    const { db, calls } = tokenDb();
    const deps = okDeps({ validateToken: async () => { throw Object.assign(new Error("x"), { status: 401 }); } });
    const out = await handleTokenSubmit("d1", "bad", db, deps as any);
    expect(calls.upsert).toBeNull();
    expect(out.toLowerCase()).toContain("invalid");
  });

  it("rejects a token missing the repo scope, naming it", async () => {
    const { db, calls } = tokenDb();
    const deps = okDeps({ validateToken: async () => ({ login: "octocat", scopes: ["notifications"] }) });
    const out = await handleTokenSubmit("d1", "ghp_x", db, deps as any);
    expect(calls.upsert).toBeNull();
    expect(out).toContain("repo");
  });

  it("rejects a token missing the notifications scope, naming it", async () => {
    const { db, calls } = tokenDb();
    const deps = okDeps({ validateToken: async () => ({ login: "octocat", scopes: ["repo"] }) });
    const out = await handleTokenSubmit("d1", "ghp_x", db, deps as any);
    expect(calls.upsert).toBeNull();
    expect(out).toContain("notifications");
  });

  it("still confirms success when onboarding throws", async () => {
    const { db } = tokenDb();
    const deps = okDeps({ onConnect: async () => { throw new Error("network"); } });
    const out = await handleTokenSubmit("d1", "ghp_x", db, deps as any);
    expect(out).toContain("octocat");
  });

  it("exposes the exact pre-filled token URL", () => {
    expect(CONNECT_TOKEN_CREATE_URL).toBe(
      "https://github.com/settings/tokens/new?scopes=repo,notifications&description=discord-pr-bot"
    );
  });
});

describe("/listen-to options", () => {
  it("pre-checks PullRequest and all reasons by default", () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    const subjects = subjectOptions(db, "user1");
    expect(subjects.find((o) => o.value === "PullRequest")!.default).toBe(true);
    expect(subjects.find((o) => o.value === "Issue")!.default).toBe(false);
    // reasons default to pass-all => every option pre-checked
    expect(reasonOptions(db, "user1").every((o) => o.default)).toBe(true);
  });

  it("persists subject and reason selections independently", () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    applySubjectSelection(db, "user1", ["PullRequest", "Issue"]);
    applyReasonSelection(db, "user1", ["mention"]);
    const subs = db.getSubscriptions("user1");
    expect([...subs.subjects].sort()).toEqual(["Issue", "PullRequest"]);
    expect([...subs.reasons!]).toEqual(["mention"]);
    // after customizing reasons, the unselected ones are no longer pre-checked
    expect(reasonOptions(db, "user1").find((o) => o.value === "comment")!.default).toBe(false);
  });
});
