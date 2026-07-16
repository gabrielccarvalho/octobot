import type { Database } from "./db";
import type { FetchResult } from "./github/notifications";
import type { SearchResult } from "./github/search";
import type { DmSender } from "./notifier";
import { attentionMessage } from "./status";
import { ssoWarnedMetaKey, ssoWarnedMetaValue } from "./github/sso";

export interface OnConnectDeps {
  db: Database;
  sender: DmSender;
  fetchNotifications(token: string, lastModified: string | null): Promise<FetchResult>;
  searchPullRequests(token: string, query: string): Promise<SearchResult>;
  awaitingQuery: string;
  fetchMinePrs(token: string): Promise<SearchResult>;
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
        // Seed the poller's warn-once gate from this same baseline fetch, using
        // the exact key/value format poller.ts checks. The onboarding summary
        // DM below already carries its own SSO warning; without this, the
        // poller's first tick ~60s later would independently DM a near-
        // duplicate warning derived from the same underlying SSO filtering.
        if (res.ssoPartialOrgIds.length > 0) {
          deps.db.setMeta(ssoWarnedMetaKey(discordId), ssoWarnedMetaValue(res.ssoPartialOrgIds));
        }
      }
    } catch (err) {
      console.warn(`Onboarding baseline failed for ${discordId}:`, err);
    }
    deps.db.updateLastModified(discordId, watermark);

    // 2. Summary: the same content as /status, as one DM.
    const [incomingResult, mineResult] = await Promise.all([
      deps.searchPullRequests(token, deps.awaitingQuery),
      deps.fetchMinePrs(token),
    ]);
    const incoming = incomingResult.prs;
    const mine = mineResult.prs;
    const ssoPartialOrgIds = [
      ...new Set([...incomingResult.ssoPartialOrgIds, ...mineResult.ssoPartialOrgIds]),
    ];
    await deps.sender.sendDm(
      discordId,
      attentionMessage(githubLogin, { incoming, mine, ssoPartialOrgIds })
    );
  };
}
