import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDatabase, type Database } from "./db";
import { createNotifier, formatMessage, type DmSender } from "./notifier";
import type { NotificationEvent } from "./github/events";
import { formatNotification } from "./notifier";
import type { NotificationItem } from "./github/notifications";

const event: NotificationEvent = {
  prNodeId: "PR_1",
  prNumber: 7,
  prTitle: "Fix bug",
  prUrl: "https://github.com/acme/repo/pull/7",
  repoFullName: "acme/repo",
  repoOwner: "acme",
  author: "author1",
  recipients: ["rev1", "rev2"],
};

let db: Database;
let sent: { discordId: string; message: string }[];
let sender: DmSender;

beforeEach(() => {
  db = createDatabase(":memory:");
  sent = [];
  sender = { sendDm: async (discordId, message) => { sent.push({ discordId, message }); } };
});

describe("formatMessage", () => {
  it("includes author, repo, number, title and url", () => {
    const msg = formatMessage(event);
    expect(msg).toContain("author1");
    expect(msg).toContain("requested your review on");
    expect(msg).toContain("acme/repo");
    expect(msg).toContain("#7");
    expect(msg).toContain("Fix bug");
    expect(msg).toContain("https://github.com/acme/repo/pull/7");
  });
});

describe("notifier", () => {
  it("DMs only linked recipients", async () => {
    db.upsertLink("discord-rev1", "rev1", null);
    const notify = createNotifier(db, sender);
    await notify(event, "delivery-1");
    expect(sent).toEqual([
      { discordId: "discord-rev1", message: formatMessage(event) },
    ]);
  });

  it("does not DM the same recipient twice for the same delivery", async () => {
    db.upsertLink("discord-rev1", "rev1", null);
    const notify = createNotifier(db, sender);
    await notify(event, "delivery-1");
    await notify(event, "delivery-1");
    expect(sent).toHaveLength(1);
  });

  it("re-notifies for a new delivery id", async () => {
    db.upsertLink("discord-rev1", "rev1", null);
    const notify = createNotifier(db, sender);
    await notify(event, "delivery-1");
    await notify(event, "delivery-2");
    expect(sent).toHaveLength(2);
  });

  it("does not mark sent when the DM fails, allowing a retry", async () => {
    db.upsertLink("discord-rev1", "rev1", null);
    const failing: DmSender = { sendDm: vi.fn(async () => { throw new Error("DMs closed"); }) };
    const notify = createNotifier(db, failing);
    await notify(event, "delivery-1"); // should not throw
    expect(db.wasSent("delivery-1", "rev1")).toBe(false);
  });
});

const item: NotificationItem = {
  threadId: "t1",
  reason: "review_requested",
  updatedAt: "2026-06-17T10:00:00Z",
  repoFullName: "acme/repo",
  prTitle: "Fix the widget",
  prUrl: "https://github.com/acme/repo/pull/42",
};

describe("formatNotification", () => {
  it("renders a review_requested notification", () => {
    const msg = formatNotification(item);
    expect(msg).toContain("Review requested");
    expect(msg).toContain("acme/repo");
    expect(msg).toContain("Fix the widget");
    expect(msg).toContain("https://github.com/acme/repo/pull/42");
  });

  it("falls back to a generic prefix for unknown reasons", () => {
    expect(formatNotification({ ...item, reason: "subscribed" })).toContain("New activity");
  });
});
