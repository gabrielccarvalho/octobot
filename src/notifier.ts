import type { NotificationItem } from "./github/notifications";
import type { LatestReview } from "./github/reviews";

export interface DmSender {
  sendDm(discordId: string, message: string): Promise<void>;
}

export type Verdict = "approved" | "changes_requested" | "reviewed";

const VERDICT_BY_STATE: Record<string, Verdict> = {
  APPROVED: "approved",
  CHANGES_REQUESTED: "changes_requested",
  COMMENTED: "reviewed",
};

const VERDICT_TOLERANCE_MS = 10_000;

export function resolveVerdict(item: NotificationItem, latestReview: LatestReview | null): Verdict | null {
  if (!latestReview) return null;
  const verdict = VERDICT_BY_STATE[latestReview.state];
  if (!verdict) return null; // DISMISSED or unknown
  // Only trust the review if it was submitted ~when this notification fired; otherwise
  // it's an old review on a PR that just got an unrelated event (e.g. a new comment).
  const drift = Math.abs(Date.parse(latestReview.submittedAt) - Date.parse(item.updatedAt));
  if (drift > VERDICT_TOLERANCE_MS) return null;
  return verdict;
}

const REASON: Record<string, { emoji: string; label: string }> = {
  review_requested: { emoji: "🔔", label: "Review requested" },
  comment: { emoji: "💬", label: "New comment" },
  mention: { emoji: "📣", label: "Mentioned" },
  state_change: { emoji: "🔀", label: "State changed" },
  author: { emoji: "✍️", label: "Activity on your PR" },
};
const FALLBACK = { emoji: "🔔", label: "New activity" };

export function formatNotification(item: NotificationItem): string {
  const { emoji, label } = REASON[item.reason] ?? FALLBACK;
  // Discord renders <t:UNIX:R> as a localized, auto-updating "5 minutes ago".
  const unix = Math.floor(new Date(item.updatedAt).getTime() / 1000);
  // Masked link keeps it clickable while suppressing Discord's bulky link embed.
  return [
    `${emoji} **${label}** · ${item.repoFullName} · <t:${unix}:R>`,
    `[#${item.prNumber} ${item.prTitle}](${item.prUrl})`,
  ].join("\n");
}
