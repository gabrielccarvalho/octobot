import { describe, it, expect } from "vitest";
import { formatNotification } from "./notifier";
import type { NotificationItem } from "./github/notifications";

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
