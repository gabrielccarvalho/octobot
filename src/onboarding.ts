import type { Database } from "./db";
import type { FetchResult } from "./github/notifications";
import type { PrSummary } from "./github/search";
import type { DmSender } from "./notifier";
import { formatAttention } from "./status";

export interface OnConnectDeps {
  db: Database;
  sender: DmSender;
  fetchNotifications(token: string, lastModified: string | null): Promise<FetchResult>;
  searchPullRequests(token: string, query: string): Promise<PrSummary[]>;
  awaitingQuery: string;
  minePrsQuery: string;
}

// Runs once when a user connects: baseline their notifications (so the poller
// won't flood them) and send a single /status-style summary DM.
export function createOnConnect(deps: OnConnectDeps) {
  return async (discordId: string, token: string, githubLogin: string): Promise<void> => {
    // 1. Baseline: record current PR threads as already-seen and set the
    //    last-modified watermark — without DMing any of them.
    let watermark = new Date().toUTCString();
    try {
      const res = await deps.fetchNotifications(token, null);
      // Any non-200 (304/401/403/etc.) intentionally falls through to the
      // `new Date()` watermark above: the user is still baselined to "now" so
      // the poller won't flood them, they just get no seen-thread backfill.
      if (res.status === 200) {
        for (const item of res.items) {
          deps.db.markNotified(discordId, item.threadId, item.updatedAt);
        }
        if (res.lastModified) watermark = res.lastModified;
      }
    } catch (err) {
      console.warn(`Onboarding baseline failed for ${discordId}:`, err);
    }
    deps.db.updateLastModified(discordId, watermark);

    // 2. Summary: the same content as /status, as one DM.
    const [incoming, mine] = await Promise.all([
      deps.searchPullRequests(token, deps.awaitingQuery),
      deps.searchPullRequests(token, deps.minePrsQuery),
    ]);
    await deps.sender.sendDm(discordId, formatAttention(githubLogin, { incoming, mine }));
  };
}
