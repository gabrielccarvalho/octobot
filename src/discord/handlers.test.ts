import { describe, it, expect, beforeEach } from "vitest";
import { createDatabase, type Database } from "../db";
import {
  handleLink,
  handleUnlink,
  handleStatus,
  type CommandContext,
} from "./handlers";

let db: Database;
let replies: string[];

function ctx(opts: { userId?: string; option?: string | null }): CommandContext {
  return {
    userId: opts.userId ?? "user1",
    guildId: "guild1",
    getOption: () => opts.option ?? null,
    reply: async (m: string) => { replies.push(m); },
  };
}

beforeEach(() => {
  db = createDatabase(":memory:");
  replies = [];
});

describe("/link", () => {
  it("links a valid username", async () => {
    await handleLink(ctx({ option: "octocat" }), db);
    expect(db.getLinkByDiscordId("user1")?.githubLogin).toBe("octocat");
    expect(replies[0]).toMatch(/octocat/);
  });

  it("rejects an invalid username", async () => {
    await handleLink(ctx({ option: "not a username!" }), db);
    expect(db.getLinkByDiscordId("user1")).toBeNull();
    expect(replies[0]).toMatch(/valid GitHub username/i);
  });

  it("rejects a username already linked by someone else", async () => {
    db.upsertLink("other", "octocat", null);
    await handleLink(ctx({ userId: "user1", option: "octocat" }), db);
    expect(replies[0]).toMatch(/already linked/i);
  });
});

describe("/unlink", () => {
  it("removes an existing link", async () => {
    db.upsertLink("user1", "octocat", null);
    await handleUnlink(ctx({ userId: "user1" }), db);
    expect(db.getLinkByDiscordId("user1")).toBeNull();
    expect(replies[0]).toMatch(/unlinked/i);
  });

  it("reports when there was nothing to unlink", async () => {
    await handleUnlink(ctx({ userId: "user1" }), db);
    expect(replies[0]).toMatch(/not linked/i);
  });
});

describe("/status", () => {
  it("shows the linked username", async () => {
    db.upsertLink("user1", "octocat", null);
    await handleStatus(ctx({ userId: "user1" }), db);
    expect(replies[0]).toMatch(/octocat/);
  });

  it("shows when not linked", async () => {
    await handleStatus(ctx({ userId: "user1" }), db);
    expect(replies[0]).toMatch(/not linked/i);
  });
});
