import type { Database, User } from "./db";
import type { FetchResult } from "./github/notifications";
import { notificationMessage, type DmSender, type PrOutcome } from "./notifier";
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

// The result of one poll, so the scheduler can honor GitHub's requested interval
// and back off while the API is failing. status 0 means "did not fetch" (user not
// yet baselined, or a local decrypt error) — neither healthy nor a GitHub failure.
export interface PollOutcome {
  status: number;
  pollInterval: number; // seconds GitHub asked us to wait; 0 when unknown
}

// Consecutive failed fetches before we warn the user once that their notifications
// are paused. Small enough to catch a real outage, large enough to ride out a blip.
export const POLL_FAILURE_ALERT_THRESHOLD = 3;

function pollFailMetaKey(discordId: string): string {
  return `poll_fail:${discordId}`;
}

// Clear a user's failure streak on any successful fetch. Only writes on the
// transition, so healthy ticks stay write-free.
function clearPollFailure(deps: PollerDeps, discordId: string): void {
  if (deps.db.getMeta(pollFailMetaKey(discordId))) {
    deps.db.setMeta(pollFailMetaKey(discordId), "");
  }
}

// Record a failed fetch and, exactly on the tick the streak crosses the threshold,
// DM the user once. The token is fine (that's the 401 path), so this asks for no
// action — it just makes the silence explainable instead of looking like "nothing new".
async function notePollFailure(deps: PollerDeps, discordId: string): Promise<void> {
  const key = pollFailMetaKey(discordId);
  const count = Number(deps.db.getMeta(key) ?? "0") + 1;
  deps.db.setMeta(key, String(count));
  if (count !== POLL_FAILURE_ALERT_THRESHOLD) return;
  try {
    await deps.sender.sendDm(discordId, {
      tone: "broken",
      color: 0xd29922, // amber: degraded, no user action needed (unlike the red 401 break)
      title: "⚠️ Can't reach your GitHub notifications",
      body:
        "GitHub has been returning errors for the last few minutes, so I've paused " +
        "checking your notifications. I'll keep retrying and they'll resume automatically " +
        "once it recovers — no action needed. `/status` may still work in the meantime.",
    });
  } catch (err) {
    console.warn(`Failed to DM poll-failure notice to ${discordId}:`, err);
  }
}

export async function pollUser(deps: PollerDeps, user: User): Promise<PollOutcome> {
  if (!user.lastModified) return { status: 0, pollInterval: 0 }; // not yet baselined; skip to avoid a flood
  let token: string;
  try {
    token = deps.decryptToken(user);
  } catch (err) {
    console.error(`Failed to decrypt token for ${user.discordId}:`, err);
    return { status: 0, pollInterval: 0 };
  }

  const res = await deps.fetchNotifications(token, user.lastModified);

  if (res.status === 304) {
    clearPollFailure(deps, user.discordId);
    return { status: 304, pollInterval: res.pollInterval };
  }

  if (res.status === 401) {
    try {
      await deps.sender.sendDm(user.discordId, {
        tone: "broken",
        color: 0xf85149,
        title: "⚠️ GitHub connection lost",
        body: `Your GitHub connection expired or was revoked. ${reconnectHint(user.authSource)}`,
      });
    } catch (err) {
      console.warn(`Failed to DM revocation notice to ${user.discordId}:`, err);
    }
    deps.db.deleteUser(user.discordId);
    return { status: 401, pollInterval: res.pollInterval };
  }

  if (res.status !== 200) {
    console.warn(`Notifications fetch for ${user.discordId} returned ${res.status}`);
    await notePollFailure(deps, user.discordId);
    return { status: res.status, pollInterval: res.pollInterval };
  }

  clearPollFailure(deps, user.discordId);

  const ssoKey = ssoWarnedMetaKey(user.discordId);
  if (res.ssoPartialOrgIds.length > 0) {
    const value = ssoWarnedMetaValue(res.ssoPartialOrgIds);
    if (deps.db.getMeta(ssoKey) !== value) {
      try {
        const n = res.ssoPartialOrgIds.length;
        await deps.sender.sendDm(user.discordId, {
          tone: "broken",
          color: 0xd29922,
          title: "⚠️ SAML SSO authorization needed",
          body:
            `Your token isn't authorized for ${n} SAML SSO organization${n > 1 ? "s" : ""}, ` +
            `so notifications from there won't arrive. Authorize it at ` +
            `<${TOKEN_SETTINGS_URL}> → **Configure SSO**.`,
        });
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
      await deps.sender.sendDm(user.discordId, notificationMessage(item, outcome));
      deps.db.markNotified(user.discordId, item.threadId, item.updatedAt);
    } catch (err) {
      console.warn(`Failed to DM ${user.discordId} for thread ${item.threadId}:`, err);
    }
  }

  return { status: 200, pollInterval: res.pollInterval };
}

// Don't let exponential backoff drift beyond this even during a long outage.
export const POLL_BACKOFF_CAP_MS = 15 * 60_000;

// How long to wait before the next tick. Never faster than the base interval or
// GitHub's requested x-poll-interval floor; after consecutive failing ticks, back
// off exponentially (first failure adds no extra delay) up to the cap.
export function nextPollDelayMs(
  failedTicks: number,
  maxPollIntervalSec: number,
  baseIntervalMs: number,
  capMs = POLL_BACKOFF_CAP_MS
): number {
  const floor = Math.max(baseIntervalMs, maxPollIntervalSec * 1000);
  if (failedTicks <= 0) return floor;
  return Math.min(floor * 2 ** (failedTicks - 1), Math.max(floor, capMs));
}

export function startPoller(deps: PollerDeps, baseIntervalMs = 60_000): { stop(): void } {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failedTicks = 0;

  const tick = async () => {
    let maxPollInterval = 0;
    let polled = false; // at least one user actually hit the API this tick
    let healthy = false; // at least one of those got 200/304
    for (const user of deps.db.getAllUsers()) {
      try {
        const outcome = await pollUser(deps, user);
        if (outcome.status !== 0) polled = true;
        if (outcome.status === 200 || outcome.status === 304) healthy = true;
        if (outcome.pollInterval > maxPollInterval) maxPollInterval = outcome.pollInterval;
      } catch (err) {
        console.error(`Poll failed for ${user.discordId}:`, err);
        polled = true; // a thrown poll is still a failed attempt, not a quiet tick
      }
    }

    // Back off only when everything we tried failed; a single success clears it.
    failedTicks = polled && !healthy ? failedTicks + 1 : 0;
    const delay = nextPollDelayMs(failedTicks, maxPollInterval, baseIntervalMs);
    if (!stopped) timer = setTimeout(() => void tick(), delay);
  };

  void tick(); // run an initial pass immediately
  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
