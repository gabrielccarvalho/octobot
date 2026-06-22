import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, type Database } from "./db";

let db: Database;
beforeEach(() => {
  db = createDatabase(":memory:");
});
afterEach(() => {
  db.close();
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

describe("subscriptions and meta", () => {
  it("defaults to PullRequest subjects and pass-all reasons", () => {
    const db = createDatabase(":memory:");
    db.upsertUser("d1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    const subs = db.getSubscriptions("d1");
    expect([...subs.subjects]).toEqual(["PullRequest"]);
    expect(subs.reasons).toBeNull();
  });

  it("round-trips subject and reason selections independently", () => {
    const db = createDatabase(":memory:");
    db.upsertUser("d1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    db.setSubscribedSubjects("d1", ["PullRequest", "Issue"]);
    expect([...db.getSubscriptions("d1").subjects].sort()).toEqual(["Issue", "PullRequest"]);
    expect(db.getSubscriptions("d1").reasons).toBeNull(); // untouched

    db.setSubscribedReasons("d1", ["mention"]);
    const subs = db.getSubscriptions("d1");
    expect([...subs.reasons!]).toEqual(["mention"]);
    expect([...subs.subjects].sort()).toEqual(["Issue", "PullRequest"]); // untouched
  });

  it("defaults digest ON for linked users, false for unknown users", () => {
    const db = createDatabase(":memory:");
    db.upsertUser("d1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    expect(db.getDigestEnabled("d1")).toBe(true);
    expect(db.getDigestEnabled("ghost")).toBe(false);
    db.setDigestEnabled("d1", false);
    expect(db.getDigestEnabled("d1")).toBe(false);
  });

  it("stores and reads meta values", () => {
    const db = createDatabase(":memory:");
    expect(db.getMeta("last_digest_date")).toBeNull();
    db.setMeta("last_digest_date", "2026-06-22");
    expect(db.getMeta("last_digest_date")).toBe("2026-06-22");
    db.setMeta("last_digest_date", "2026-06-23");
    expect(db.getMeta("last_digest_date")).toBe("2026-06-23");
  });
});
