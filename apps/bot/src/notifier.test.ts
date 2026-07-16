import { describe, it, expect } from "vitest";
import {
  formatNotification,
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

describe("formatNotification", () => {
  it("renders a reason label in the two-line masked-link layout when there is no outcome", () => {
    const [first, second] = formatNotification(item).split("\n");
    expect(first).toContain("**Review requested**");
    expect(first).toContain("acme/repo");
    const unix = Math.floor(Date.parse("2026-06-17T10:00:00Z") / 1000);
    expect(first).toContain(`<t:${unix}:R>`);
    expect(second).toBe("[#42 Fix the widget](https://github.com/acme/repo/pull/42)");
  });

  it("renders a numberless subject without a leading #", () => {
    const release = { ...item, reason: "subscribed", subjectType: "Release", subjectNumber: null, subjectTitle: "v1.2.0", subjectUrl: "https://github.com/acme/repo" };
    expect(formatNotification(release).split("\n")[1]).toBe("[v1.2.0](https://github.com/acme/repo)");
  });

  const eventCases: [PrOutcome, string, string][] = [
    [{ source: "event", kind: "approved" }, "✅", "Your PR was approved"],
    [{ source: "event", kind: "changes_requested" }, "🔧", "Changes requested on your PR"],
    [{ source: "event", kind: "reviewed" }, "💬", "New review on your PR"],
    [{ source: "event", kind: "commented" }, "💬", "New comment on your PR"],
    [{ source: "event", kind: "committed" }, "📌", "New commits on your PR"],
    [{ source: "event", kind: "merged" }, "🎉", "Your PR was merged"],
    [{ source: "event", kind: "closed" }, "🚪", "Your PR was closed"],
    [{ source: "event", kind: "reopened" }, "🔓", "Your PR was reopened"],
    [{ source: "event", kind: "ready_for_review" }, "📝", "Marked ready for review"],
    [{ source: "event", kind: "converted_to_draft" }, "📄", "Converted to draft"],
    [{ source: "event", kind: "assigned" }, "👤", "You were assigned"],
    [{ source: "event", kind: "labeled" }, "🏷️", "Labels changed on your PR"],
    [{ source: "event", kind: "review_requested" }, "🔔", "Review requested"],
    [{ source: "event", kind: "mentioned" }, "📣", "Mentioned"],
    [{ source: "checks", verdict: "passed" }, "✅", "CI passed on your PR"],
    [{ source: "checks", verdict: "failed" }, "❌", "CI failed on your PR"],
  ];

  it.each(eventCases)("renders %o as its label", (outcome, emoji, label) => {
    const first = formatNotification(item, outcome).split("\n")[0];
    expect(first).toContain(emoji);
    expect(first).toContain(`**${label}**`);
  });

  it("never shows the bare generic label for an author PR with no outcome", () => {
    const first = formatNotification(authorItem, null).split("\n")[0];
    expect(first).not.toContain("Activity on your PR");
    expect(first).toContain("**Update on your PR**");
  });

  it("keeps a specific reason label (mention) as the fallback when there is no outcome", () => {
    expect(formatNotification({ ...item, reason: "mention" }, null)).toContain("**Mentioned**");
  });
});

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
