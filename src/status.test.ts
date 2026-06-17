import { describe, it, expect } from "vitest";
import { formatAttention, type AttentionList } from "./status";
import type { PrSummary } from "./github/search";

const UPDATED_AT = "2026-06-17T10:00:00Z";
const UNIX = Math.floor(Date.parse(UPDATED_AT) / 1000);

function pr(n: number, title = "Title", repo = "acme/repo"): PrSummary {
  return {
    repoFullName: repo,
    number: n,
    title,
    url: `https://github.com/${repo}/pull/${n}`,
    updatedAt: UPDATED_AT,
  };
}

function attention(over: Partial<AttentionList> = {}): AttentionList {
  return { incoming: [], mine: [], ...over };
}

describe("formatAttention", () => {
  it("renders the header and groups PRs by repo with relative timestamps", () => {
    const msg = formatAttention(
      "octocat",
      attention({
        incoming: [
          pr(128, "Add rate limiting", "acme/api"),
          pr(130, "Fix pagination", "acme/api"),
          pr(54, "Fix nav overflow", "acme/web"),
        ],
      })
    );
    expect(msg).toContain("✅ Connected as `octocat`");
    expect(msg).toContain("**acme/api**");
    expect(msg).toContain("**acme/web**");
    expect(msg).toContain(
      `#128 [Add rate limiting](https://github.com/acme/api/pull/128) · <t:${UNIX}:R>`
    );
    expect(msg.match(/\*\*acme\/api\*\*/g)).toHaveLength(1);
  });

  it("truncates a long title to 59 characters", () => {
    const msg = formatAttention("octocat", attention({ incoming: [pr(1, "x".repeat(80))] }));
    expect(msg).toContain(`[${"x".repeat(58)}…]`);
    expect(msg).not.toContain("x".repeat(60));
  });

  it("shows friendly empty-state lines for empty sections", () => {
    const msg = formatAttention("octocat", attention());
    expect(msg).toMatch(/Nothing awaiting your review/i);
    expect(msg).toMatch(/No open PRs of yours/i);
  });

  it("caps a section at 10 PRs and notes the remainder", () => {
    const many = Array.from({ length: 13 }, (_, i) => pr(i + 1));
    const msg = formatAttention("octocat", attention({ incoming: many }));
    const prLines = msg.split("\n").filter((l) => /^#\d+ /.test(l));
    expect(prLines).toHaveLength(10);
    expect(msg).toContain("…and 3 more");
  });

  it("clamps an oversized message to 2000 characters", () => {
    const full = (repo: string) =>
      Array.from({ length: 10 }, (_, i) => pr(i + 1, "y".repeat(59), repo));
    const msg = formatAttention("octocat", attention({ incoming: full("acme/api"), mine: full("acme/web") }));
    expect(msg.length).toBeLessThanOrEqual(2000);
  });
});
