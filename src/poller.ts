import type { Database, User } from "./db";
import type { FetchResult } from "./github/notifications";
import { formatNotification, type DmSender, type PrOutcome } from "./notifier";
import type { PrEvent } from "./github/timeline";
import type { ChecksVerdict } from "./github/checks";
import { reconnectHint, TOKEN_SETTINGS_URL } from "./status";
import { ssoWarnedMetaKey, ssoWarnedMetaValue } from "./github/sso";

export interface PollerDeps {
  db: Database;
  sender: DmSender;
  decryptToken(user: User): string;
  fetchNotifications(token: string, lastModified: string | null): Promise<FetchResult>;
  fetchPrEvent(token: string, repoFullName: string, prNumber: number, at: string): Promise<PrEvent | null>;
  fetchChecksVerdict(token: string, repoFullName: string, prNumber: number): Promise<ChecksVerdict | null>;
}

export async function pollUser(deps: PollerDeps, user: User): Promise<void> {
  if (!user.lastModified) return; // not yet baselined by onboarding; skip to avoid a flood
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
        `⚠️ Your GitHub connection expired or was revoked. ${reconnectHint(user.authSource)}`
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

  const ssoKey = ssoWarnedMetaKey(user.discordId);
  if (res.ssoPartialOrgIds.length > 0) {
    const value = ssoWarnedMetaValue(res.ssoPartialOrgIds);
    if (deps.db.getMeta(ssoKey) !== value) {
      try {
        const n = res.ssoPartialOrgIds.length;
        await deps.sender.sendDm(
          user.discordId,
          `⚠️ Your token isn't authorized for ${n} SAML SSO organization${n > 1 ? "s" : ""}, ` +
            `so notifications from there won't arrive. Authorize it at <${TOKEN_SETTINGS_URL}> → **Configure SSO**.`
        );
        deps.db.setMeta(ssoKey, value);
      } catch (err) {
        console.warn(`Failed to DM SSO warning to ${user.discordId}:`, err);
      }
    }
  } else if (deps.db.getMeta(ssoKey)) {
    deps.db.setMeta(ssoKey, "");
  }

  if (res.lastModified) deps.db.updateLastModified(user.discordId, res.lastModified);

  const subs = deps.db.getSubscriptions(user.discordId);

  for (const item of res.items) {
    if (!subs.subjects.has(item.subjectType)) continue;
    if (subs.reasons !== null && !subs.reasons.has(item.reason)) continue;
    if (deps.db.wasNotified(user.discordId, item.threadId, item.updatedAt)) continue;
    let outcome: PrOutcome | null = null;
    if (item.subjectType === "PullRequest" && item.subjectNumber != null) {
      try {
        const event = await deps.fetchPrEvent(token, item.repoFullName, item.subjectNumber, item.updatedAt);
        if (event) {
          outcome = { source: "event", kind: event.kind };
        } else if (item.reason === "ci_activity") {
          // selectPrEvent also returns null for unmapped-but-notifying events (rename,
          // dismissed review, cross-reference, base-branch force-push); only probe CI
          // when GitHub itself flags the notification as CI activity, so those don't
          // get mislabeled "CI passed/failed".
          const verdict = await deps.fetchChecksVerdict(token, item.repoFullName, item.subjectNumber);
          if (verdict) outcome = { source: "checks", verdict };
        }
      } catch (err) {
        // Enrichment is best-effort; never let it drop the notification.
        console.warn(`Event enrichment failed for ${user.discordId} thread ${item.threadId}:`, err);
      }
    }
    try {
      await deps.sender.sendDm(user.discordId, formatNotification(item, outcome));
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
