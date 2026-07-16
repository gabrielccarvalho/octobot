import { describe, it, expect, beforeEach } from "vitest";
import { createDatabase, type Database } from "./db";
import { brtParts, maybeRunDigest } from "./scheduler";
import type { DigestDeps } from "./digest";
import type { DmSender, OctoMessage } from "./notifier";
import type { PrSummary } from "./github/search";

let db: Database;
let sent: { discordId: string; message: OctoMessage }[];

const pr = (n: number): PrSummary => ({
  repoFullName: "acme/repo",
  number: n,
  title: `PR ${n}`,
  url: `https://github.com/acme/repo/pull/${n}`,
  updatedAt: "2026-06-17T10:00:00Z",
});

function deps(): DigestDeps {
  const sender: DmSender = { sendDm: async (discordId, message) => { sent.push({ discordId, message }); } };
  return {
    db,
    sender,
    decryptToken: () => "tok",
    searchPullRequests: async () => ({ prs: [pr(7)], ssoPartialOrgIds: [] }),
    awaitingQuery: "AWAITING",
    fetchMinePrs: async () => ({ prs: [pr(7)], ssoPartialOrgIds: [] }),
  };
}

const at = (utc: string) => Date.parse(utc);

beforeEach(() => {
  db = createDatabase(":memory:");
  db.upsertUser("d1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
  sent = [];
});

describe("brtParts", () => {
  it("converts a UTC instant to the BRT date and hour", () => {
    // 09:00Z == 06:00 BRT
    expect(brtParts(at("2026-06-22T09:00:00Z"))).toEqual({ date: "2026-06-22", hour: 6 });
    // 02:00Z == 23:00 of the previous BRT day
    expect(brtParts(at("2026-06-22T02:00:00Z"))).toEqual({ date: "2026-06-21", hour: 23 });
  });
});

describe("maybeRunDigest", () => {
  it("does not run before 06:00 BRT", async () => {
    const ran = await maybeRunDigest(deps(), at("2026-06-22T08:59:00Z")); // 05:59 BRT
    expect(ran).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("runs once at/after 06:00 BRT and records the date", async () => {
    const ran = await maybeRunDigest(deps(), at("2026-06-22T09:00:00Z"));
    expect(ran).toBe(true);
    expect(sent).toHaveLength(1);
    expect(db.getMeta("last_digest_date")).toBe("2026-06-22");
  });

  it("does not re-run the same BRT day (survives restart)", async () => {
    await maybeRunDigest(deps(), at("2026-06-22T09:00:00Z"));
    sent = [];
    const ran = await maybeRunDigest(deps(), at("2026-06-22T15:00:00Z"));
    expect(ran).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("runs again the next BRT day", async () => {
    await maybeRunDigest(deps(), at("2026-06-22T09:00:00Z"));
    sent = [];
    const ran = await maybeRunDigest(deps(), at("2026-06-23T09:30:00Z"));
    expect(ran).toBe(true);
    expect(sent).toHaveLength(1);
  });
});
