import { describe, it, expect } from "vitest";
import {
  notificationMessage,
  toneForReason,
  REASON_TONE,
  type PrOutcome,
} from "./notifier";
import type { NotificationItem } from "./github/notifications";
import { ALL_REASON_KEYS } from "./github/taxonomy";

const item: NotificationItem = {
  threadId: "t1",
  reason: "review_requested",
  updatedAt: "2026-06-17T10:00:00Z",
  repoFullName: "acme/repo",
  subjectType: "PullRequest",
  subjectNumber: 42,
  subjectTitle: "Fix the widget",
  subjectUrl: "https://github.com/acme/repo/pull/42",
};

const authorItem: NotificationItem = { ...item, reason: "author" };

describe("notificationMessage", () => {
  it("puts emoji+label in the title and link+repo+relative-time in the body", () => {
    const msg = notificationMessage(item, { source: "event", kind: "merged" });
    const unix = Math.floor(Date.parse("2026-06-17T10:00:00Z") / 1000);
    expect(msg.title).toBe("🎉 Your PR was merged");
    expect(msg.body).toBe(
      `[#42 Fix the widget](https://github.com/acme/repo/pull/42)\nacme/repo · <t:${unix}:R>`
    );
    expect(msg.tone).toBe("celebrate");
    expect(msg.color).toBe(0x8957e5);
  });

  it("renders a numberless subject without a leading #", () => {
    const release = {
      ...item,
      reason: "subscribed",
      subjectType: "Release",
      subjectNumber: null,
      subjectTitle: "v1.2.0",
      subjectUrl: "https://github.com/acme/repo",
    };
    expect(notificationMessage(release).body.split("\n")[0]).toBe(
      "[v1.2.0](https://github.com/acme/repo)"
    );
  });

  it("separates merged from approved by colour despite sharing a tone", () => {
    const merged = notificationMessage(item, { source: "event", kind: "merged" });
    const approved = notificationMessage(item, { source: "event", kind: "approved" });
    expect(merged.tone).toBe(approved.tone);
    expect(merged.color).not.toBe(approved.color);
  });

  it("separates reviewed from commented by colour despite sharing tone and emoji", () => {
    const reviewed = notificationMessage(item, { source: "event", kind: "reviewed" });
    const commented = notificationMessage(item, { source: "event", kind: "commented" });
    expect(reviewed.tone).toBe("chatter");
    expect(commented.tone).toBe("chatter");
    expect(reviewed.color).toBe(0xa371f7);
    expect(commented.color).toBe(0x58a6ff);
  });

  it("maps closed to working, not alarm", () => {
    expect(notificationMessage(item, { source: "event", kind: "closed" }).tone).toBe("working");
  });

  it("maps CI verdicts", () => {
    expect(notificationMessage(item, { source: "checks", verdict: "passed" }).tone).toBe("all_good");
    expect(notificationMessage(item, { source: "checks", verdict: "failed" }).tone).toBe("alarm");
    expect(notificationMessage(item, { source: "checks", verdict: "failed" }).color).toBe(0xf85149);
  });

  it("uses the working tone with no colour override for the generic PR fallback", () => {
    const msg = notificationMessage(authorItem);
    expect(msg.title).toBe("🔔 Update on your PR");
    expect(msg.tone).toBe("working");
    expect(msg.color).toBeUndefined();
  });

  it("falls back to a reason tone for non-PR subjects", () => {
    const issue = { ...item, subjectType: "Issue", reason: "comment" };
    expect(notificationMessage(issue).tone).toBe("chatter");
  });
});

describe("toneForReason", () => {
  // Asserts EXPLICIT coverage, not just "returns something". toneForReason ends in
  // `?? "working"`, so a test that merely checks the result is a valid Tone can never
  // fail — it would pass for garbage input and silently miss a new reason arriving
  // from taxonomy.ts without a tone. Check membership in the map instead.
  it("gives every known reason an explicit tone rather than the fallback", () => {
    expect(ALL_REASON_KEYS.filter((key) => !(key in REASON_TONE))).toEqual([]);
  });

  it("falls back to working for unknown reasons GitHub may add later", () => {
    expect(toneForReason("some_future_reason")).toBe("working");
  });
});
