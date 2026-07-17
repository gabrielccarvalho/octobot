import type { NotificationItem } from "./github/notifications";
import type { PrEventKind } from "./github/timeline";
import type { ChecksVerdict } from "./github/checks";
import { reasonMeta } from "./github/taxonomy";
import type { Tone } from "./messages/tone";

export interface DmSender {
  sendDm(discordId: string, message: OctoMessage): Promise<void>;
}

// A resolved explanation of what triggered a PR notification.
export type PrOutcome =
  | { source: "event"; kind: PrEventKind }
  | { source: "checks"; verdict: ChecksVerdict };

// What a message says and how it should feel. Deliberately knows nothing about
// discord.js — discord/render.ts turns this into an embed at the edge.
export interface OctoMessage {
  tone: Tone;
  title: string;
  body: string;
  color?: number; // overrides the tone's default
}

interface Meta {
  emoji: string;
  label: string; // author-facing framing ("Your PR was approved")
  // Non-author framing, given the PR number ("PR #123 was approved"). Absent when the
  // label is about the viewer, not the PR (e.g. "You were assigned"), so it reads the
  // same either way.
  otherLabel?: (n: number) => string;
  tone: Tone;
  color?: number;
}

const PR_EVENT_META: Record<PrEventKind, Meta> = {
  approved: {
    emoji: "✅",
    label: "Your PR was approved",
    otherLabel: (n) => `PR #${n} was approved`,
    tone: "celebrate",
    color: 0x3fb950,
  },
  changes_requested: {
    emoji: "🔧",
    label: "Changes requested on your PR",
    otherLabel: (n) => `Changes requested on PR #${n}`,
    tone: "needs_work",
    color: 0xd29922, // amber, not red: healthy review is not a failure
  },
  reviewed: {
    emoji: "💬",
    label: "New review on your PR",
    otherLabel: (n) => `New review on PR #${n}`,
    tone: "chatter",
    color: 0xa371f7,
  },
  commented: {
    emoji: "💬",
    label: "New comment on your PR",
    otherLabel: (n) => `New comment on PR #${n}`,
    tone: "chatter",
    color: 0x58a6ff,
  },
  committed: {
    emoji: "📌",
    label: "New commits on your PR",
    otherLabel: (n) => `New commits on PR #${n}`,
    tone: "working",
    color: 0x8b949e,
  },
  merged: {
    emoji: "🎉",
    label: "Your PR was merged",
    otherLabel: (n) => `PR #${n} was merged`,
    tone: "celebrate",
    color: 0x8957e5,
  },
  closed: {
    emoji: "🚪",
    label: "Your PR was closed",
    otherLabel: (n) => `PR #${n} was closed`,
    tone: "working",
    color: 0x848d97,
  },
  reopened: {
    emoji: "🔓",
    label: "Your PR was reopened",
    otherLabel: (n) => `PR #${n} was reopened`,
    tone: "working",
    color: 0x3fb950,
  },
  ready_for_review: {
    emoji: "📝",
    label: "Marked ready for review",
    otherLabel: (n) => `PR #${n} marked ready for review`,
    tone: "summoned",
    color: 0x58a6ff,
  },
  converted_to_draft: {
    emoji: "📄",
    label: "Converted to draft",
    otherLabel: (n) => `PR #${n} converted to draft`,
    tone: "working",
    color: 0x848d97,
  },
  assigned: { emoji: "👤", label: "You were assigned", tone: "summoned", color: 0x58a6ff },
  labeled: {
    emoji: "🏷️",
    label: "Labels changed on your PR",
    otherLabel: (n) => `Labels changed on PR #${n}`,
    tone: "working",
    color: 0x8b949e,
  },
  review_requested: { emoji: "🔔", label: "Review requested", tone: "summoned", color: 0x58a6ff },
  mentioned: { emoji: "📣", label: "Mentioned", tone: "summoned", color: 0xd29922 },
};

const CHECKS_META: Record<ChecksVerdict, Meta> = {
  passed: {
    emoji: "✅",
    label: "CI passed on your PR",
    otherLabel: (n) => `CI passed on PR #${n}`,
    tone: "all_good",
    color: 0x3fb950,
  },
  failed: {
    emoji: "❌",
    label: "CI failed on your PR",
    otherLabel: (n) => `CI failed on PR #${n}`,
    tone: "alarm",
    color: 0xf85149,
  },
};

// GitHub's `reason` collapses to a catch-all for authored/subscribed PRs. When we
// could not classify the event, still avoid the bare "Activity on your PR".
const GENERIC_PR_REASONS = new Set(["author", "subscribed", "your_activity", "manual"]);
const PR_FALLBACK = {
  emoji: "🔔",
  label: "Update on your PR",
  otherLabel: (n: number) => `Update on PR #${n}`,
};

// Reason tones carry no colour override — the tone default is correct for all of them.
// A Map (not a plain object) so lookups can't accidentally resolve inherited
// Object.prototype keys like "constructor" or "toString" — mirrors the REASON_BY_KEY
// idiom in taxonomy.ts, which the spec calls out as the pattern to follow.
// Exported so the test can assert every key in taxonomy.ts has an explicit entry here;
// without that, toneForReason's fallback would silently swallow a new GitHub reason.
export const REASON_TONE: Map<string, Tone> = new Map([
  ["comment", "chatter"],
  ["review_requested", "summoned"],
  ["mention", "summoned"],
  ["team_mention", "summoned"],
  ["assign", "summoned"],
  ["invitation", "summoned"],
  ["security_alert", "alarm"],
  ["state_change", "working"],
  ["author", "working"],
  ["ci_activity", "working"],
  ["subscribed", "working"],
  ["manual", "working"],
  ["your_activity", "working"],
  ["push", "working"],
]);

// GitHub adds reason values over time; mirror reasonMeta's fallback rather than
// assuming the known keys are total.
export function toneForReason(key: string): Tone {
  return REASON_TONE.get(key) ?? "working";
}

function resolveMeta(item: NotificationItem, outcome: PrOutcome | null): Meta {
  if (outcome?.source === "event") return PR_EVENT_META[outcome.kind];
  if (outcome?.source === "checks") return CHECKS_META[outcome.verdict];
  if (item.subjectType === "PullRequest" && GENERIC_PR_REASONS.has(item.reason)) {
    return { ...PR_FALLBACK, tone: "working" };
  }
  const meta = reasonMeta(item.reason);
  return { emoji: meta.emoji, label: meta.label, tone: toneForReason(item.reason) };
}

export function notificationMessage(
  item: NotificationItem,
  outcome?: PrOutcome | null,
  isAuthor: boolean = true
): OctoMessage {
  const meta = resolveMeta(item, outcome ?? null);
  // A PR that isn't the viewer's gets non-possessive framing ("PR #123 was approved")
  // so we never call someone else's PR theirs. Falls back to the author label when
  // there's no number or the label is viewer-centric to begin with (e.g. "Mentioned").
  const label =
    !isAuthor && meta.otherLabel && item.subjectNumber != null
      ? meta.otherLabel(item.subjectNumber)
      : meta.label;
  // Discord renders <t:UNIX:R> as a localized, auto-updating "5 minutes ago". It only
  // parses in a description, never a footer — so it lives at the end of the body.
  const unix = Math.floor(new Date(item.updatedAt).getTime() / 1000);
  const link =
    item.subjectNumber != null
      ? `[#${item.subjectNumber} ${item.subjectTitle}](${item.subjectUrl})`
      : `[${item.subjectTitle}](${item.subjectUrl})`;
  return {
    tone: meta.tone,
    color: meta.color,
    title: `${meta.emoji} ${label}`,
    body: [link, `${item.repoFullName} · <t:${unix}:R>`].join("\n"),
  };
}
