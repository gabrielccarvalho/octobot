import { describe, it, expect } from "vitest";
import {
  SUBJECT_TYPES,
  REASONS,
  DEFAULT_SUBJECT_KEYS,
  ALL_SUBJECT_KEYS,
  ALL_REASON_KEYS,
  reasonMeta,
  subjectMeta,
} from "./taxonomy";

describe("taxonomy", () => {
  it("includes PullRequest as the only default subject", () => {
    expect(DEFAULT_SUBJECT_KEYS).toEqual(["PullRequest"]);
    expect(ALL_SUBJECT_KEYS).toContain("PullRequest");
    expect(ALL_SUBJECT_KEYS).toContain("Issue");
  });

  it("preserves the existing PR reason labels for backward compatibility", () => {
    expect(reasonMeta("review_requested")).toEqual({
      key: "review_requested",
      label: "Review requested",
      emoji: "🔔",
    });
    expect(reasonMeta("author").label).toBe("Activity on your PR");
  });

  it("falls back for an unknown reason", () => {
    expect(reasonMeta("totally_made_up").label).toBe("New activity");
  });

  it("falls back for an unknown subject type", () => {
    expect(subjectMeta("Galaxy").label).toBe("Activity");
  });

  it("exposes every reason key", () => {
    expect(ALL_REASON_KEYS).toEqual(REASONS.map((r) => r.key));
    expect(ALL_REASON_KEYS).toContain("ci_activity");
  });

  it("has unique keys within each axis", () => {
    expect(new Set(ALL_SUBJECT_KEYS).size).toBe(SUBJECT_TYPES.length);
    expect(new Set(ALL_REASON_KEYS).size).toBe(REASONS.length);
  });
});
