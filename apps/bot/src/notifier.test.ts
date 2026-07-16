import { describe, it, expect } from "vitest";
import {
  notificationMessage,
  toneForReason,
  REASON_TONE,
  type PrOutcome,
} from "./notifier";
import type { NotificationItem } from "./github/notifications";
import type { PrEventKind } from "./github/timeline";
import type { Tone } from "./messages/tone";
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

// The design spec is the source of truth for PR_EVENT_META, not notifier.ts itself —
// asserting against a re-derivation of the implementation would be circular and could
// never catch a transposed emoji/label/tone/color in the table.
const EXPECTED_EVENT_META: Record<
  PrEventKind,
  { emoji: string; label: string; tone: Tone; color: number }
> = {
  merged: { emoji: "🎉", label: "Your PR was merged", tone: "celebrate", color: 0x8957e5 },
  approved: { emoji: "✅", label: "Your PR was approved", tone: "celebrate", color: 0x3fb950 },
  changes_requested: {
    emoji: "🔧",
    label: "Changes requested on your PR",
    tone: "needs_work",
    color: 0xd29922,
  },
  reviewed: { emoji: "💬", label: "New review on your PR", tone: "chatter", color: 0xa371f7 },
  commented: { emoji: "💬", label: "New comment on your PR", tone: "chatter", color: 0x58a6ff },
  committed: { emoji: "📌", label: "New commits on your PR", tone: "working", color: 0x8b949e },
  closed: { emoji: "🚪", label: "Your PR was closed", tone: "working", color: 0x848d97 },
  reopened: { emoji: "🔓", label: "Your PR was reopened", tone: "working", color: 0x3fb950 },
  ready_for_review: {
    emoji: "📝",
    label: "Marked ready for review",
    tone: "summoned",
    color: 0x58a6ff,
  },
  converted_to_draft: {
    emoji: "📄",
    label: "Converted to draft",
    tone: "working",
    color: 0x848d97,
  },
  assigned: { emoji: "👤", label: "You were assigned", tone: "summoned", color: 0x58a6ff },
  labeled: { emoji: "🏷️", label: "Labels changed on your PR", tone: "working", color: 0x8b949e },
  review_requested: { emoji: "🔔", label: "Review requested", tone: "summoned", color: 0x58a6ff },
  mentioned: { emoji: "📣", label: "Mentioned", tone: "summoned", color: 0xd29922 },
};

// TypeScript forces this literal to have a key for every PrEventKind. If a 15th kind is
// added to timeline.ts without a matching row above, this record fails to compile —
// `tsc --noEmit` catches it even though EXPECTED_EVENT_META itself is separately typed.
const ALL_EVENT_KINDS: Record<PrEventKind, true> = {
  merged: true,
  approved: true,
  changes_requested: true,
  reviewed: true,
  commented: true,
  committed: true,
  closed: true,
  reopened: true,
  ready_for_review: true,
  converted_to_draft: true,
  assigned: true,
  labeled: true,
  review_requested: true,
  mentioned: true,
};

describe("PR_EVENT_META coverage (exhaustive per-kind)", () => {
  const kinds = Object.keys(ALL_EVENT_KINDS) as PrEventKind[];

  it("covers every PrEventKind with no extras and no gaps", () => {
    expect(kinds.length).toBe(14);
    expect(Object.keys(EXPECTED_EVENT_META).sort()).toEqual([...kinds].sort());
  });

  it.each(kinds)("renders title, tone, and color for %s", (kind) => {
    const expected = EXPECTED_EVENT_META[kind];
    const msg = notificationMessage(item, { source: "event", kind });
    expect(msg.title).toBe(`${expected.emoji} ${expected.label}`);
    expect(msg.tone).toBe(expected.tone);
    expect(msg.color).toBe(expected.color);
  });
});

describe("toneForReason", () => {
  // Asserts EXPLICIT coverage, not just "returns something". toneForReason ends in
  // `?? "working"`, so a test that merely checks the result is a valid Tone can never
  // fail — it would pass for garbage input and silently miss a new reason arriving
  // from taxonomy.ts without a tone. Check membership in the map instead. Uses
  // `.has`, not `in` — REASON_TONE is a Map, so this cannot walk Object.prototype.
  it("gives every known reason an explicit tone rather than the fallback", () => {
    expect(ALL_REASON_KEYS.filter((key) => !REASON_TONE.has(key))).toEqual([]);
  });

  it("falls back to working for unknown reasons GitHub may add later", () => {
    expect(toneForReason("some_future_reason")).toBe("working");
  });

  // Regression: REASON_TONE used to be a plain object literal, so lookups for
  // inherited Object.prototype keys (e.g. "constructor", "toString") resolved to
  // those prototype functions instead of falling through to "working" — silently
  // producing a non-Tone value that later blew up rendering. A Map has no
  // prototype-chain lookup, so these must resolve through the fallback.
  it("falls back to working for prototype-polluting keys instead of resolving Object.prototype members", () => {
    expect(toneForReason("constructor")).toBe("working");
    expect(toneForReason("toString")).toBe("working");
  });
});
