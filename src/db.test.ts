import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, type Database } from "./db";

let db: Database;
beforeEach(() => {
  db = createDatabase(":memory:");
});
afterEach(() => {
  db.close();
});

describe("links", () => {
  it("upserts and reads a link", () => {
    expect(db.upsertLink("d1", "octocat", "g1")).toEqual({ ok: true });
    const link = db.getLinkByDiscordId("d1");
    expect(link?.githubLogin).toBe("octocat");
    expect(link?.guildId).toBe("g1");
  });

  it("re-linking the same discord user replaces the login", () => {
    db.upsertLink("d1", "octocat", null);
    db.upsertLink("d1", "hubot", null);
    expect(db.getLinkByDiscordId("d1")?.githubLogin).toBe("hubot");
    expect(db.getDiscordIdsByGithubLogin("octocat")).toEqual([]);
  });

  it("rejects a login already claimed by another discord user", () => {
    db.upsertLink("d1", "octocat", null);
    expect(db.upsertLink("d2", "octocat", null)).toEqual({
      ok: false,
      reason: "github_login_taken",
    });
  });

  it("matches github logins case-insensitively", () => {
    db.upsertLink("d1", "OctoCat", null);
    expect(db.getDiscordIdsByGithubLogin("octocat")).toEqual(["d1"]);
  });

  it("removeLink reports whether a row was removed", () => {
    db.upsertLink("d1", "octocat", null);
    expect(db.removeLink("d1")).toBe(true);
    expect(db.removeLink("d1")).toBe(false);
    expect(db.getLinkByDiscordId("d1")).toBeNull();
  });
});

describe("dedup", () => {
  it("tracks sent notifications per delivery+login", () => {
    expect(db.wasSent("delivery-1", "octocat")).toBe(false);
    db.markSent("delivery-1", "octocat");
    expect(db.wasSent("delivery-1", "octocat")).toBe(true);
    expect(db.wasSent("delivery-2", "octocat")).toBe(false);
  });

  it("markSent is idempotent", () => {
    db.markSent("delivery-1", "octocat");
    expect(() => db.markSent("delivery-1", "octocat")).not.toThrow();
  });
});
