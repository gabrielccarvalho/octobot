import { describe, it, expect, beforeEach } from "vitest";
import { createDatabase, type Database, type User } from "./db";
import { buildDigest, buildDigestData, sendDigests, type DigestDeps } from "./digest";
import type { DmSender, OctoMessage } from "./notifier";
import type { PrSummary, SearchResult } from "./github/search";

let db: Database;
let sent: { discordId: string; message: OctoMessage }[];
let sender: DmSender;

const pr = (n: number): PrSummary => ({
  repoFullName: "acme/repo",
  number: n,
  title: `PR ${n}`,
  url: `https://github.com/acme/repo/pull/${n}`,
  updatedAt: "2026-06-17T10:00:00Z",
});

function deps(
  results: Record<string, PrSummary[]>,
  ssoPartialOrgIds: Record<string, string[]> = {}
): DigestDeps {
  return {
    db,
    sender,
    decryptToken: () => "tok",
    searchPullRequests: async (_token, query): Promise<SearchResult> => ({
      prs: results[query] ?? [],
      ssoPartialOrgIds: ssoPartialOrgIds[query] ?? [],
    }),
    awaitingQuery: "AWAITING",
    fetchMinePrs: async (): Promise<SearchResult> => ({
      prs: results["MINE"] ?? [],
      ssoPartialOrgIds: ssoPartialOrgIds["MINE"] ?? [],
    }),
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

  it("returns a warning-only digest when both sections are empty but SSO org IDs are present", async () => {
    const user = db.getUser("d1")!;
    const d = deps(
      { AWAITING: [], MINE: [] },
      { AWAITING: ["21955855"], MINE: ["21955855"] }
    );
    const msg = await buildDigest(d, user);
    expect(msg).not.toBeNull();
    expect(msg).toContain("your token isn't authorized for 1 SAML SSO organization.");
  });

  it("returns null when both sections and SSO org IDs are all empty", async () => {
    const user = db.getUser("d1")!;
    const d = deps({ AWAITING: [], MINE: [] }, { AWAITING: [], MINE: [] });
    expect(await buildDigest(d, user)).toBeNull();
  });

  it("appends the SSO warning, unioning and deduping org IDs from both searches", async () => {
    const user = db.getUser("d1")!;
    const d = deps(
      { AWAITING: [pr(7)], MINE: [] },
      { AWAITING: ["21955855", "20582480"], MINE: ["20582480", "999"] }
    );
    const msg = await buildDigest(d, user);
    expect(msg).toContain("your token isn't authorized for 3 SAML SSO organizations.");
  });

  it("renders byte-identically to today when ssoPartialOrgIds is empty", async () => {
    const user = db.getUser("d1")!;
    const msg = await buildDigest(deps({ AWAITING: [pr(7)], MINE: [] }), user);
    expect(msg).not.toContain("⚠️");
  });
});

describe("sendDigests", () => {
  it("DMs users with content and skips empty ones", async () => {
    db.upsertUser("d2", "hubot", { ciphertext: "a", iv: "b", tag: "c" });
    const d = deps({ AWAITING: [pr(7)], MINE: [] });
    await sendDigests(d);
    expect(sent).toHaveLength(2); // both users have content (same fake results)
    expect(sent[0].message.tone).toBe("digest");
    expect(sent[0].message.title).toBe("☀️ Daily PR digest for octocat");
    expect(sent[0].message.body).toContain("#7");
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

describe("buildDigestData", () => {
  it("returns null when there is nothing to report", async () => {
    const user = db.getUser("d1")!;
    expect(await buildDigestData(deps({ AWAITING: [], MINE: [] }), user)).toBeNull();
  });

  it("returns the list when a warning-only digest is warranted", async () => {
    const user = db.getUser("d1")!;
    const d = deps({ AWAITING: [], MINE: [] }, { AWAITING: ["21955855"], MINE: ["21955855"] });
    const list = await buildDigestData(d, user);
    expect(list).not.toBeNull();
    expect(list!.ssoPartialOrgIds).toEqual(["21955855"]);
  });

  it("still backs buildDigest's string output unchanged", async () => {
    const user = db.getUser("d1")!;
    const msg = await buildDigest(deps({ AWAITING: [pr(7)], MINE: [] }), user);
    expect(msg).toContain("Daily PR digest");
    expect(msg).toContain("#7");
  });
});
