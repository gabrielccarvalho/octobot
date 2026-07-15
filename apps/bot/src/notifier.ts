import type { NotificationItem } from "./github/notifications";
import type { PrEventKind } from "./github/timeline";
import type { ChecksVerdict } from "./github/checks";
import { reasonMeta } from "./github/taxonomy";

export interface DmSender {
  sendDm(discordId: string, message: string): Promise<void>;
}

// A resolved explanation of what triggered a PR notification.
export type PrOutcome =
  | { source: "event"; kind: PrEventKind }
  | { source: "checks"; verdict: ChecksVerdict };

const PR_EVENT_LABEL: Record<PrEventKind, { emoji: string; label: string }> = {
  approved: { emoji: "✅", label: "Your PR was approved" },
  changes_requested: { emoji: "🔧", label: "Changes requested on your PR" },
  reviewed: { emoji: "💬", label: "New review on your PR" },
  commented: { emoji: "💬", label: "New comment on your PR" },
  committed: { emoji: "📌", label: "New commits on your PR" },
  merged: { emoji: "🎉", label: "Your PR was merged" },
  closed: { emoji: "🚪", label: "Your PR was closed" },
  reopened: { emoji: "🔓", label: "Your PR was reopened" },
  ready_for_review: { emoji: "📝", label: "Marked ready for review" },
  converted_to_draft: { emoji: "📄", label: "Converted to draft" },
  assigned: { emoji: "👤", label: "You were assigned" },
  labeled: { emoji: "🏷️", label: "Labels changed on your PR" },
  review_requested: { emoji: "🔔", label: "Review requested" },
  mentioned: { emoji: "📣", label: "Mentioned" },
};

const CHECKS_LABEL: Record<ChecksVerdict, { emoji: string; label: string }> = {
  passed: { emoji: "✅", label: "CI passed on your PR" },
  failed: { emoji: "❌", label: "CI failed on your PR" },
};

// GitHub's `reason` collapses to a catch-all for authored/subscribed PRs. When we
// could not classify the event, still avoid the bare "Activity on your PR".
const GENERIC_PR_REASONS = new Set(["author", "subscribed", "your_activity", "manual"]);
const PR_FALLBACK = { emoji: "🔔", label: "Update on your PR" };

function resolveMeta(item: NotificationItem, outcome: PrOutcome | null): { emoji: string; label: string } {
  if (outcome?.source === "event") return PR_EVENT_LABEL[outcome.kind];
  if (outcome?.source === "checks") return CHECKS_LABEL[outcome.verdict];
  if (item.subjectType === "PullRequest" && GENERIC_PR_REASONS.has(item.reason)) return PR_FALLBACK;
  return reasonMeta(item.reason);
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
