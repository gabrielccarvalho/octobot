import type { Database, User } from "./db";
import type { FetchResult } from "./github/notifications";
import { formatNotification, type DmSender } from "./notifier";

export interface PollerDeps {
  db: Database;
  sender: DmSender;
  decryptToken(user: User): string;
  fetchNotifications(token: string, lastModified: string | null): Promise<FetchResult>;
}

export async function pollUser(deps: PollerDeps, user: User): Promise<void> {
  let token: string;
  try {
    token = deps.decryptToken(user);
  } catch (err) {
    console.error(`Failed to decrypt token for ${user.discordId}:`, err);
    return;
  }

  const res = await deps.fetchNotifications(token, user.lastModified);

  if (res.status === 304) return;

  if (res.status === 401) {
    try {
      await deps.sender.sendDm(
        user.discordId,
        "⚠️ Your GitHub connection expired or was revoked. Run `/link` to reconnect."
      );
    } catch (err) {
      console.warn(`Failed to DM revocation notice to ${user.discordId}:`, err);
    }
    deps.db.deleteUser(user.discordId);
    return;
  }

  if (res.status !== 200) {
    console.warn(`Notifications fetch for ${user.discordId} returned ${res.status}`);
    return;
  }

  if (res.lastModified) deps.db.updateLastModified(user.discordId, res.lastModified);

  for (const item of res.items) {
    if (deps.db.wasNotified(user.discordId, item.threadId, item.updatedAt)) continue;
    try {
      await deps.sender.sendDm(user.discordId, formatNotification(item));
      deps.db.markNotified(user.discordId, item.threadId, item.updatedAt);
    } catch (err) {
      console.warn(`Failed to DM ${user.discordId} for thread ${item.threadId}:`, err);
    }
  }
}

export function startPoller(deps: PollerDeps, intervalMs = 60_000): { stop(): void } {
  const tick = async () => {
    for (const user of deps.db.getAllUsers()) {
      try {
        await pollUser(deps, user);
      } catch (err) {
        console.error(`Poll failed for ${user.discordId}:`, err);
      }
    }
  };
  const handle = setInterval(() => void tick(), intervalMs);
  void tick(); // run an initial pass immediately
  return { stop: () => clearInterval(handle) };
}
