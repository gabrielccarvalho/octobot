import { describe, it, expect } from "vitest";
import { parseEvent } from "./events";

const pr = {
  node_id: "PR_123",
  number: 42,
  title: "Add widget",
  html_url: "https://github.com/acme/repo/pull/42",
  user: { login: "author1" },
  requested_reviewers: [{ login: "rev1" }, { login: "rev2" }],
};
const repository = { full_name: "acme/repo", owner: { login: "acme" } };

describe("parseEvent", () => {
  it("parses review_requested for an individual reviewer", () => {
    const event = parseEvent("review_requested", {
      action: "review_requested",
      pull_request: pr,
      repository,
      requested_reviewer: { login: "rev1" },
    });
    expect(event).toEqual({
      prNodeId: "PR_123",
      prNumber: 42,
      prTitle: "Add widget",
      prUrl: "https://github.com/acme/repo/pull/42",
      repoFullName: "acme/repo",
      repoOwner: "acme",
      author: "author1",
      recipients: ["rev1"],
    });
  });

  it("ignores a team review_requested (no individual reviewer)", () => {
    const event = parseEvent("review_requested", {
      action: "review_requested",
      pull_request: pr,
      repository,
      requested_team: { name: "core" },
    });
    expect(event).toBeNull();
  });

  it("parses ready_for_review using current requested reviewers", () => {
    const event = parseEvent("ready_for_review", {
      action: "ready_for_review",
      pull_request: pr,
      repository,
    });
    expect(event?.recipients).toEqual(["rev1", "rev2"]);
  });

  it("returns null for ready_for_review with no requested reviewers", () => {
    const event = parseEvent("ready_for_review", {
      action: "ready_for_review",
      pull_request: { ...pr, requested_reviewers: [] },
      repository,
    });
    expect(event).toBeNull();
  });

  it("returns null for unsupported actions", () => {
    expect(
      parseEvent("closed", { action: "closed", pull_request: pr, repository })
    ).toBeNull();
  });
});
