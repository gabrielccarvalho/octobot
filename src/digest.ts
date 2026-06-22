import type { Database, User } from "./db";
import type { PrSummary } from "./github/search";
import type { DmSender } from "./notifier";
import { formatDigest } from "./status";

export interface DigestDeps {
  db: Database;
  sender: DmSender;
  decryptToken(user: User): string;
  searchPullRequests(token: string, query: string): Promise<PrSummary[]>;
  awaitingQuery: string;
  minePrsQuery: string;
}

// Stateless current-state snapshot of the PRs needing this user's attention.
// Returns null when there is nothing to report, so we never DM an empty digest.
export async function buildDigest(deps: DigestDeps, user: User): Promise<string | null> {
  const token = deps.decryptToken(user);
  const [incoming, mine] = await Promise.all([
    deps.searchPullRequests(token, deps.awaitingQuery),
    deps.searchPullRequests(token, deps.minePrsQuery),
  ]);
  if (incoming.length === 0 && mine.length === 0) return null;
  return formatDigest(user.githubLogin, { incoming, mine });
}

export async function sendDigests(deps: DigestDeps): Promise<void> {
  for (const user of deps.db.getAllUsers()) {
    if (!deps.db.getDigestEnabled(user.discordId)) continue;
    try {
      const message = await buildDigest(deps, user);
      if (message) await deps.sender.sendDm(user.discordId, message);
    } catch (err) {
      console.error(`Digest failed for ${user.discordId}:`, err);
    }
  }
}
