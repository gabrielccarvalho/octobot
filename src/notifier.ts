import type { Database } from "./db";
import type { NotificationEvent } from "./github/events";
import type { NotificationItem } from "./github/notifications";

export interface DmSender {
  sendDm(discordId: string, message: string): Promise<void>;
}

export function formatMessage(event: NotificationEvent): string {
  return [
    `🔔 **${event.author}** requested your review on **${event.repoFullName}**`,
    `#${event.prNumber} — ${event.prTitle}`,
    event.prUrl,
  ].join("\n");
}

export function createNotifier(
  db: Database,
  sender: DmSender
): (event: NotificationEvent, deliveryId: string) => Promise<void> {
  return async (event, deliveryId) => {
    const message = formatMessage(event);
    for (const login of event.recipients) {
      if (db.wasSent(deliveryId, login)) continue;
      const discordIds = db.getDiscordIdsByGithubLogin(login);
      if (discordIds.length === 0) continue;
      try {
        for (const discordId of discordIds) {
          await sender.sendDm(discordId, message);
        }
        db.markSent(deliveryId, login);
      } catch (err) {
        console.warn(`Failed to DM for ${login}:`, err);
        // Intentionally not marked sent so a redelivery can retry.
      }
    }
  };
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
