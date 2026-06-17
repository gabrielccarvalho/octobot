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

describe("users", () => {
  it("upserts and reads a user", () => {
    db.upsertUser("d1", "octocat", { ciphertext: "ct", iv: "iv", tag: "tg" });
    const u = db.getUser("d1");
    expect(u?.githubLogin).toBe("octocat");
    expect(u?.tokenCiphertext).toBe("ct");
    expect(u?.lastModified).toBeNull();
  });

  it("upsert replaces token and resets last_modified", () => {
    db.upsertUser("d1", "octocat", { ciphertext: "ct", iv: "iv", tag: "tg" });
    db.updateLastModified("d1", "Mon");
    db.upsertUser("d1", "octocat", { ciphertext: "ct2", iv: "iv2", tag: "tg2" });
    const u = db.getUser("d1");
    expect(u?.tokenCiphertext).toBe("ct2");
    expect(u?.lastModified).toBeNull();
  });

  it("lists all users and deletes one", () => {
    db.upsertUser("d1", "a", { ciphertext: "1", iv: "1", tag: "1" });
    db.upsertUser("d2", "b", { ciphertext: "2", iv: "2", tag: "2" });
    expect(db.getAllUsers().map((u) => u.discordId).sort()).toEqual(["d1", "d2"]);
    expect(db.deleteUser("d1")).toBe(true);
    expect(db.deleteUser("d1")).toBe(false);
    expect(db.getUser("d1")).toBeNull();
  });

  it("updates last_modified", () => {
    db.upsertUser("d1", "a", { ciphertext: "1", iv: "1", tag: "1" });
    db.updateLastModified("d1", "Tue");
    expect(db.getUser("d1")?.lastModified).toBe("Tue");
  });
});

describe("notified dedup", () => {
  it("tracks per (discord, thread, updatedAt)", () => {
    expect(db.wasNotified("d1", "t1", "u1")).toBe(false);
    db.markNotified("d1", "t1", "u1");
    expect(db.wasNotified("d1", "t1", "u1")).toBe(true);
    expect(db.wasNotified("d1", "t1", "u2")).toBe(false);
  });

  it("markNotified is idempotent", () => {
    db.markNotified("d1", "t1", "u1");
    expect(() => db.markNotified("d1", "t1", "u1")).not.toThrow();
  });
});

describe("oauth states", () => {
  it("consumes a valid state once, returning the discord id", () => {
    db.createState("s1", "d1");
    expect(db.consumeState("s1", 60_000)).toBe("d1");
    expect(db.consumeState("s1", 60_000)).toBeNull(); // single use
  });

  it("rejects an expired state", () => {
    db.createState("s2", "d1");
    expect(db.consumeState("s2", -1)).toBeNull(); // any age exceeds a -1ms TTL
  });

  it("returns null for an unknown state", () => {
    expect(db.consumeState("nope", 60_000)).toBeNull();
  });
});
