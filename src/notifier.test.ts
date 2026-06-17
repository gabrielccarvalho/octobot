import { describe, it, expect } from "vitest";
import { formatNotification } from "./notifier";
import type { NotificationItem } from "./github/notifications";

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
