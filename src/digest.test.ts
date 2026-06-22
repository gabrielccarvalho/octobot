import { describe, it, expect, beforeEach } from "vitest";
import { createDatabase, type Database, type User } from "./db";
import { buildDigest, sendDigests, type DigestDeps } from "./digest";
import type { DmSender } from "./notifier";
import type { PrSummary } from "./github/search";

let db: Database;
let sent: { discordId: string; message: string }[];
let sender: DmSender;

const pr = (n: number): PrSummary => ({
  repoFullName: "acme/repo",
  number: n,
  title: `PR ${n}`,
  url: `https://github.com/acme/repo/pull/${n}`,
  updatedAt: "2026-06-17T10:00:00Z",
});

function deps(results: Record<string, PrSummary[]>): DigestDeps {
  return {
    db,
    sender,
    decryptToken: () => "tok",
    searchPullRequests: async (_token, query) => results[query] ?? [],
    awaitingQuery: "AWAITING",
    minePrsQuery: "MINE",
  };
}

beforeEach(() => {
  db = createDatabase(":memory:");
  db.upsertUser("d1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
  sent = [];
  sender = { sendDm: async (discordId, message) => { sent.push({ discordId, message }); } };
});

describe("buildDigest", () => {
  it("returns a formatted digest when there is something to report", async () => {
    const user = db.getUser("d1")!;
    const msg = await buildDigest(deps({ AWAITING: [pr(7)], MINE: [] }), user);
    expect(msg).toContain("Daily PR digest");
    expect(msg).toContain("#7");
  });

  it("returns null when both sections are empty", async () => {
    const user = db.getUser("d1")!;
    expect(await buildDigest(deps({ AWAITING: [], MINE: [] }), user)).toBeNull();
  });
});

describe("sendDigests", () => {
  it("DMs users with content and skips empty ones", async () => {
    db.upsertUser("d2", "hubot", { ciphertext: "a", iv: "b", tag: "c" });
    const d = deps({ AWAITING: [pr(7)], MINE: [] });
    await sendDigests(d);
    expect(sent).toHaveLength(2); // both users have content (same fake results)
  });

  it("skips users who disabled the digest", async () => {
    db.setDigestEnabled("d1", false);
    await sendDigests(deps({ AWAITING: [pr(7)], MINE: [] }));
    expect(sent).toHaveLength(0);
  });

  it("isolates a per-user failure", async () => {
    db.upsertUser("d2", "hubot", { ciphertext: "a", iv: "b", tag: "c" });
    const d = deps({ AWAITING: [pr(7)], MINE: [] });
    d.searchPullRequests = async (_t, query) => {
      // first user throws, second succeeds
      throw Object.assign(new Error("boom"), { query });
    };
    await expect(sendDigests(d)).resolves.toBeUndefined();
  });
});
