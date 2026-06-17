import type { NotificationItem } from "./github/notifications";

export interface DmSender {
  sendDm(discordId: string, message: string): Promise<void>;
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
