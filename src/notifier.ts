import type { NotificationItem } from "./github/notifications";

export interface DmSender {
  sendDm(discordId: string, message: string): Promise<void>;
}

const REASON_PREFIX: Record<string, string> = {
  review_requested: "🔔 Review requested",
  comment: "💬 New comment",
  mention: "📣 Mentioned",
  state_change: "🔀 State changed",
  author: "✍️ Activity on your PR",
};

export function formatNotification(item: NotificationItem): string {
  const prefix = REASON_PREFIX[item.reason] ?? "🔔 New activity";
  return [`${prefix} on **${item.repoFullName}**`, item.prTitle, item.prUrl].join("\n");
}
