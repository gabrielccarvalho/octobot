import { describe, it, expect } from "vitest";
import { formatAttention, formatDigest, reconnectHint, attentionMessage, digestMessage, type AttentionList } from "./status";
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
  return { incoming: [], mine: [], ssoPartialOrgIds: [], ...over };
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

describe("SSO partial-results warning", () => {
  it("renders byte-identically to today when ssoPartialOrgIds is empty", () => {
    const withEmpty = formatAttention("octocat", attention({ incoming: [pr(1)], ssoPartialOrgIds: [] }));
    const withoutField = formatAttention(
      "octocat",
      // Asserts an empty ssoPartialOrgIds array renders with no warning appended,
      // i.e. identically to the pre-SSO-warning output.
      { incoming: [pr(1)], mine: [], ssoPartialOrgIds: [] } as AttentionList
    );
    expect(withEmpty).toBe(withoutField);
    expect(withEmpty).not.toContain("⚠️");
  });

  it("appends a singular warning for one unauthorized org", () => {
    const msg = formatAttention("octocat", attention({ ssoPartialOrgIds: ["21955855"] }));
    expect(msg).toContain(
      "⚠️ Results are incomplete — your token isn't authorized for 1 SAML SSO organization. " +
        "Authorize it at <https://github.com/settings/tokens> → **Configure SSO**, then re-run."
    );
  });

  it("appends a plural warning for multiple unauthorized orgs", () => {
    const msg = formatAttention(
      "octocat",
      attention({ ssoPartialOrgIds: ["21955855", "20582480"] })
    );
    expect(msg).toContain("your token isn't authorized for 2 SAML SSO organizations.");
  });

  it("includes the warning in formatDigest too, still within the 2000-char clamp", () => {
    const msg = formatDigest("octocat", attention({ ssoPartialOrgIds: ["1", "2"] }));
    expect(msg).toContain("your token isn't authorized for 2 SAML SSO organizations.");
    expect(msg.length).toBeLessThanOrEqual(2000);
  });
});

describe("mine PR reviewer labels", () => {
  it("appends the requested reviewer for a single-reviewer mine PR", () => {
    const msg = formatAttention(
      "octocat",
      attention({ mine: [{ ...pr(1), requestedReviewers: ["@majovanilla"] }] })
    );
    expect(msg).toContain(
      `#1 [Title](https://github.com/acme/repo/pull/1) · <t:${UNIX}:R> · awaiting @majovanilla`
    );
  });

  it("joins multiple requested reviewers with a comma", () => {
    const msg = formatAttention(
      "octocat",
      attention({ mine: [{ ...pr(1), requestedReviewers: ["@a", "@b"] }] })
    );
    expect(msg).toContain(`· awaiting @a, @b`);
  });

  it("labels a mine PR with no requested reviewer", () => {
    const msg = formatAttention("octocat", attention({ mine: [{ ...pr(1), requestedReviewers: [] }] }));
    expect(msg).toContain("· awaiting review (no reviewer assigned)");
  });

  it("renders an incoming PR (requestedReviewers undefined) with no reviewer suffix", () => {
    const msg = formatAttention("octocat", attention({ incoming: [pr(1)] }));
    const prLine = msg.split("\n").find((l) => l.startsWith("#1 "));
    expect(prLine).toBe(`#1 [Title](https://github.com/acme/repo/pull/1) · <t:${UNIX}:R>`);
  });
});

describe("reconnectHint", () => {
  it("points oauth users at /link", () => {
    expect(reconnectHint("oauth")).toBe("Run `/link` to reconnect.");
  });

  it("points pat users at /connect-token", () => {
    expect(reconnectHint("pat")).toBe("Run `/connect-token` with a fresh token to reconnect.");
  });
});

describe("formatDigest", () => {
  it("uses a digest header and renders both sections", () => {
    const list = {
      incoming: [
        { repoFullName: "acme/repo", number: 7, title: "Fix bug", url: "https://github.com/acme/repo/pull/7", updatedAt: "2026-06-17T10:00:00Z" },
      ],
      mine: [],
      ssoPartialOrgIds: [],
    };
    const msg = formatDigest("octocat", list);
    expect(msg).toContain("Daily PR digest");
    expect(msg).toContain("octocat");
    expect(msg).toContain("#7 [Fix bug](https://github.com/acme/repo/pull/7)");
    expect(msg).toContain("No open PRs of yours are waiting on a review.");
  });
});

describe("attentionMessage / digestMessage", () => {
  const list = {
    incoming: [] as never[],
    mine: [] as never[],
    ssoPartialOrgIds: [] as string[],
  };

  it("puts the header in the title with no markdown, and the body without it", () => {
    const msg = attentionMessage("octocat", list);
    expect(msg.title).toBe("✅ Connected as octocat");
    expect(msg.title).not.toContain("`");
    expect(msg.tone).toBe("celebrate");
    expect(msg.body).toContain("Nothing awaiting your review.");
    expect(msg.body).not.toContain("Connected as");
  });

  it("gives the digest its own tone and title", () => {
    const msg = digestMessage("octocat", list);
    expect(msg.title).toBe("☀️ Daily PR digest for octocat");
    expect(msg.title).not.toContain("*");
    expect(msg.tone).toBe("digest");
  });

  // The previous version of this test asserted formatDigest(...).toContain(msg.body)
  // using only the empty-list fixture, where it passes vacuously. It doesn't hold in
  // general: formatDigest clamps header+body together to 2000 chars while digestMessage
  // clamps the body alone, so a long body can be truncated mid-string in the former and
  // no longer contain the (unclamped) latter. That divergence is intentional and benign
  // — Discord embeds and plain-text messages have different budgets — so this replacement
  // scopes the shared-renderBody claim to where it actually holds: below the clamp
  // threshold, formatDigest is exactly the header followed by digestMessage's body.
  it("renders as exactly header + digestMessage's body when nothing needs clamping", () => {
    const smallList = {
      incoming: [pr(7, "Fix bug")],
      mine: [pr(9, "Add feature")],
      ssoPartialOrgIds: [],
    };
    const msg = digestMessage("octocat", smallList);
    const header = "☀️ **Daily PR digest** for `octocat`";
    expect(formatDigest("octocat", smallList)).toBe(`${header}\n\n${msg.body}`);
  });
});
