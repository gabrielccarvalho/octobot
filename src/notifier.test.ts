import { describe, it, expect } from "vitest";
import { formatNotification, resolveVerdict } from "./notifier";
import type { NotificationItem } from "./github/notifications";
import type { LatestReview } from "./github/reviews";

const item: NotificationItem = {
  threadId: "t1",
  reason: "review_requested",
  updatedAt: "2026-06-17T10:00:00Z",
  repoFullName: "acme/repo",
  prNumber: 42,
  prTitle: "Fix the widget",
  prUrl: "https://github.com/acme/repo/pull/42",
};

describe("formatNotification", () => {
  it("renders a review_requested notification in the two-line masked-link layout", () => {
    const msg = formatNotification(item);
    const [first, second] = msg.split("\n");
    // Line 1: bold reason · repo · relative timestamp
    expect(first).toContain("**Review requested**");
    expect(first).toContain("acme/repo");
    // Discord relative timestamp for 2026-06-17T10:00:00Z
    const unix = Math.floor(Date.parse("2026-06-17T10:00:00Z") / 1000);
    expect(first).toContain(`<t:${unix}:R>`);
    // Line 2: masked link with PR number + title (suppresses Discord's embed)
    expect(second).toBe("[#42 Fix the widget](https://github.com/acme/repo/pull/42)");
  });

  it("falls back to a generic prefix for unknown reasons", () => {
    expect(formatNotification({ ...item, reason: "subscribed" })).toContain("New activity");
  });
});

describe("resolveVerdict", () => {
  // item.updatedAt is "2026-06-17T10:00:00Z" (defined at top of file)
  const at = (state: LatestReview["state"], submittedAt: string): LatestReview => ({ state, submittedAt });

  it("returns null when there is no review", () => {
    expect(resolveVerdict(item, null)).toBeNull();
  });

  it("maps an approval submitted at the notification time", () => {
    expect(resolveVerdict(item, at("APPROVED", "2026-06-17T10:00:00Z"))).toBe("approved");
  });

  it("maps changes requested", () => {
    expect(resolveVerdict(item, at("CHANGES_REQUESTED", "2026-06-17T10:00:05Z"))).toBe("changes_requested");
  });

  it("maps a commented review to reviewed", () => {
    expect(resolveVerdict(item, at("COMMENTED", "2026-06-17T10:00:00Z"))).toBe("reviewed");
  });

  it("returns null for a dismissed review", () => {
    expect(resolveVerdict(item, at("DISMISSED", "2026-06-17T10:00:00Z"))).toBeNull();
  });

  it("ignores a stale review outside the timestamp tolerance", () => {
    // approval happened 5 minutes before this notification's updatedAt -> not the trigger
    expect(resolveVerdict(item, at("APPROVED", "2026-06-17T09:55:00Z"))).toBeNull();
  });
});
