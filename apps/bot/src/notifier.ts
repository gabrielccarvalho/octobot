import type { NotificationItem } from "./github/notifications";
import type { PrEventKind } from "./github/timeline";
import type { ChecksVerdict } from "./github/checks";
import { reasonMeta } from "./github/taxonomy";
import type { Tone } from "./messages/tone";

export interface DmSender {
  sendDm(discordId: string, message: string): Promise<void>;
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
  label: string;
  tone: Tone;
  color?: number;
}

const PR_EVENT_META: Record<PrEventKind, Meta> = {
  approved: { emoji: "✅", label: "Your PR was approved", tone: "celebrate", color: 0x3fb950 },
  changes_requested: {
    emoji: "🔧",
    label: "Changes requested on your PR",
    tone: "needs_work",
    color: 0xd29922, // amber, not red: healthy review is not a failure
  },
  reviewed: { emoji: "💬", label: "New review on your PR", tone: "chatter", color: 0xa371f7 },
  commented: { emoji: "💬", label: "New comment on your PR", tone: "chatter", color: 0x58a6ff },
  committed: { emoji: "📌", label: "New commits on your PR", tone: "working", color: 0x8b949e },
  merged: { emoji: "🎉", label: "Your PR was merged", tone: "celebrate", color: 0x8957e5 },
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

const CHECKS_META: Record<ChecksVerdict, Meta> = {
  passed: { emoji: "✅", label: "CI passed on your PR", tone: "all_good", color: 0x3fb950 },
  failed: { emoji: "❌", label: "CI failed on your PR", tone: "alarm", color: 0xf85149 },
};

// GitHub's `reason` collapses to a catch-all for authored/subscribed PRs. When we
// could not classify the event, still avoid the bare "Activity on your PR".
const GENERIC_PR_REASONS = new Set(["author", "subscribed", "your_activity", "manual"]);
const PR_FALLBACK = { emoji: "🔔", label: "Update on your PR" };

// Reason tones carry no colour override — the tone default is correct for all of them.
// Exported so the test can assert every key in taxonomy.ts has an explicit entry here;
// without that, toneForReason's fallback would silently swallow a new GitHub reason.
export const REASON_TONE: Record<string, Tone> = {
  comment: "chatter",
  review_requested: "summoned",
  mention: "summoned",
  team_mention: "summoned",
  assign: "summoned",
  invitation: "summoned",
  security_alert: "alarm",
  state_change: "working",
  author: "working",
  ci_activity: "working",
  subscribed: "working",
  manual: "working",
  your_activity: "working",
  push: "working",
};

// GitHub adds reason values over time; mirror reasonMeta's fallback rather than
// assuming the known keys are total.
export function toneForReason(key: string): Tone {
  return REASON_TONE[key] ?? "working";
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

export function formatNotification(item: NotificationItem, outcome?: PrOutcome | null): string {
  const { emoji, label } = resolveMeta(item, outcome ?? null);
  // Discord renders <t:UNIX:R> as a localized, auto-updating "5 minutes ago".
  const unix = Math.floor(new Date(item.updatedAt).getTime() / 1000);
  // Masked link keeps it clickable while suppressing Discord's bulky link embed.
  const link =
    item.subjectNumber != null
      ? `[#${item.subjectNumber} ${item.subjectTitle}](${item.subjectUrl})`
      : `[${item.subjectTitle}](${item.subjectUrl})`;
  return [`${emoji} **${label}** · ${item.repoFullName} · <t:${unix}:R>`, link].join("\n");
}

export function notificationMessage(
  item: NotificationItem,
  outcome?: PrOutcome | null
): OctoMessage {
  const meta = resolveMeta(item, outcome ?? null);
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
    title: `${meta.emoji} ${meta.label}`,
    body: [link, `${item.repoFullName} · <t:${unix}:R>`].join("\n"),
  };
}
