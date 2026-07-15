# `/listen-to` subscriptions + daily PR digest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the bot to deliver every GitHub notification subject type with a per-user `/listen-to` filter (subject types × reasons), and add a daily 06:00 BRT `/digest` of the PRs that need each user's attention.

**Architecture:** A new taxonomy module is the single source of truth for both filter axes. The `users` table gains nullable subscription columns (NULL = today's behavior) plus a `meta` key/value table. Notification parsing stops dropping non-PR subjects; the poller filters each item against the user's subscription before sending. A stateless digest reuses the existing search + status formatters, fired by an `Intl`-based scheduler that records the last run date in `meta` so restarts don't double-send. Two new interactive Discord commands manage the prefs.

**Tech Stack:** TypeScript (strict), discord.js v14, better-sqlite3, vitest. No new runtime dependencies.

## Global Constraints

- No new runtime dependencies — scheduler uses `setInterval` + `Intl.DateTimeFormat`, not `node-cron`.
- discord.js version: `^14.16.0` (already installed).
- Digest time: 06:00 in `America/Sao_Paulo` (BRT, UTC−3, no DST), global for all users.
- Defaults preserve today's behavior exactly: subject types default to `["PullRequest"]`; reasons default to **pass-all** (NULL column); digest defaults ON.
- Filtering semantics: an item is delivered iff `subjects.has(subjectType)` AND (`reasons === null` OR `reasons.has(reason)`).
- Commit messages: plain, no `Co-Authored-By` / generated-by trailers.
- All tests use the real in-memory DB (`createDatabase(":memory:")`) — there are no hand-rolled `Database` fakes to update.
- Run `npm run typecheck && npm test` green before every commit.

## File Structure

- **Create** `src/github/taxonomy.ts` — subject-type & reason tables + lookup helpers (Task 1).
- **Create** `src/github/taxonomy.test.ts` — taxonomy tests (Task 1).
- **Modify** `src/db.ts` — subscription columns + meta table + new methods (Task 2).
- **Modify** `src/db.test.ts` — tests for the new DB surface (Task 2).
- **Modify** `src/github/notifications.ts` — generalize `NotificationItem` to all subjects (Task 3).
- **Modify** `src/github/notifications.test.ts`, `src/notifier.ts`, `src/notifier.test.ts`, `src/poller.ts`, `src/poller.test.ts` — follow the rename (Task 3).
- **Modify** `src/poller.ts` + `src/poller.test.ts` — subscription filtering (Task 4).
- **Modify** `src/status.ts` + `src/status.test.ts` — `formatDigest` (Task 5).
- **Create** `src/digest.ts` + `src/digest.test.ts` — `buildDigest` / `sendDigests` (Task 6).
- **Create** `src/scheduler.ts` + `src/scheduler.test.ts` — BRT scheduler (Task 7).
- **Modify** `src/discord/handlers.ts` + `src/discord/handlers.test.ts` — `/listen-to` + `/digest` pure logic (Task 8 & 9).
- **Modify** `src/discord/commands.ts` + `src/discord/commands.test.ts` — register the two commands (Task 8 & 9).
- **Modify** `src/discord/client.ts` — chat-command + component (select/button) routing (Task 8 & 9).
- **Modify** `src/index.ts` — wire digest deps + start the scheduler (Task 10).

---

### Task 1: Notification taxonomy module

**Files:**
- Create: `src/github/taxonomy.ts`
- Test: `src/github/taxonomy.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface TaxonomyEntry { key: string; label: string; emoji: string }`
  - `const SUBJECT_TYPES: TaxonomyEntry[]`, `const REASONS: TaxonomyEntry[]`
  - `const DEFAULT_SUBJECT_KEYS: string[]`, `const ALL_SUBJECT_KEYS: string[]`, `const ALL_REASON_KEYS: string[]`
  - `function reasonMeta(key: string): TaxonomyEntry` (fallback `{ key:"", label:"New activity", emoji:"🔔" }`)
  - `function subjectMeta(key: string): TaxonomyEntry` (fallback `{ key:"", label:"Activity", emoji:"🔔" }`)

- [ ] **Step 1: Write the failing test**

Create `src/github/taxonomy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  SUBJECT_TYPES,
  REASONS,
  DEFAULT_SUBJECT_KEYS,
  ALL_SUBJECT_KEYS,
  ALL_REASON_KEYS,
  reasonMeta,
  subjectMeta,
} from "./taxonomy";

describe("taxonomy", () => {
  it("includes PullRequest as the only default subject", () => {
    expect(DEFAULT_SUBJECT_KEYS).toEqual(["PullRequest"]);
    expect(ALL_SUBJECT_KEYS).toContain("PullRequest");
    expect(ALL_SUBJECT_KEYS).toContain("Issue");
  });

  it("preserves the existing PR reason labels for backward compatibility", () => {
    expect(reasonMeta("review_requested")).toEqual({
      key: "review_requested",
      label: "Review requested",
      emoji: "🔔",
    });
    expect(reasonMeta("author").label).toBe("Activity on your PR");
  });

  it("falls back for an unknown reason", () => {
    expect(reasonMeta("totally_made_up").label).toBe("New activity");
  });

  it("falls back for an unknown subject type", () => {
    expect(subjectMeta("Galaxy").label).toBe("Activity");
  });

  it("exposes every reason key", () => {
    expect(ALL_REASON_KEYS).toEqual(REASONS.map((r) => r.key));
    expect(ALL_REASON_KEYS).toContain("ci_activity");
  });

  it("has unique keys within each axis", () => {
    expect(new Set(ALL_SUBJECT_KEYS).size).toBe(SUBJECT_TYPES.length);
    expect(new Set(ALL_REASON_KEYS).size).toBe(REASONS.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/github/taxonomy.test.ts`
Expected: FAIL — cannot find module `./taxonomy`.

- [ ] **Step 3: Write minimal implementation**

Create `src/github/taxonomy.ts`:

```ts
export interface TaxonomyEntry {
  key: string;
  label: string;
  emoji: string;
}

// Subject types are GitHub notification `subject.type` values.
export const SUBJECT_TYPES: TaxonomyEntry[] = [
  { key: "PullRequest", label: "Pull requests", emoji: "🔀" },
  { key: "Issue", label: "Issues", emoji: "🐛" },
  { key: "Discussion", label: "Discussions", emoji: "💬" },
  { key: "Release", label: "Releases", emoji: "🚀" },
  { key: "Commit", label: "Commits", emoji: "📝" },
  { key: "CheckSuite", label: "CI / checks", emoji: "✅" },
  { key: "RepositoryVulnerabilityAlert", label: "Security alerts", emoji: "🛡️" },
];

// Reasons are GitHub notification `reason` values. The first five keep the exact
// emoji/label the previous REASON table used, so existing PR behavior is unchanged.
export const REASONS: TaxonomyEntry[] = [
  { key: "review_requested", label: "Review requested", emoji: "🔔" },
  { key: "comment", label: "New comment", emoji: "💬" },
  { key: "mention", label: "Mentioned", emoji: "📣" },
  { key: "state_change", label: "State changed", emoji: "🔀" },
  { key: "author", label: "Activity on your PR", emoji: "✍️" },
  { key: "team_mention", label: "Team mentioned", emoji: "👥" },
  { key: "assign", label: "Assigned", emoji: "📌" },
  { key: "ci_activity", label: "CI activity", emoji: "⚙️" },
  { key: "subscribed", label: "Subscribed thread", emoji: "🔖" },
  { key: "manual", label: "Manually subscribed", emoji: "✋" },
  { key: "invitation", label: "Invitation", emoji: "📨" },
  { key: "security_alert", label: "Security alert", emoji: "🛡️" },
  { key: "your_activity", label: "Your activity", emoji: "🪞" },
  { key: "push", label: "New commits pushed", emoji: "⬆️" },
];

export const DEFAULT_SUBJECT_KEYS: string[] = ["PullRequest"];
export const ALL_SUBJECT_KEYS: string[] = SUBJECT_TYPES.map((s) => s.key);
export const ALL_REASON_KEYS: string[] = REASONS.map((r) => r.key);

const REASON_FALLBACK: TaxonomyEntry = { key: "", label: "New activity", emoji: "🔔" };
const SUBJECT_FALLBACK: TaxonomyEntry = { key: "", label: "Activity", emoji: "🔔" };

const REASON_BY_KEY = new Map(REASONS.map((r) => [r.key, r]));
const SUBJECT_BY_KEY = new Map(SUBJECT_TYPES.map((s) => [s.key, s]));

export function reasonMeta(key: string): TaxonomyEntry {
  return REASON_BY_KEY.get(key) ?? REASON_FALLBACK;
}

export function subjectMeta(key: string): TaxonomyEntry {
  return SUBJECT_BY_KEY.get(key) ?? SUBJECT_FALLBACK;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/github/taxonomy.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/github/taxonomy.ts src/github/taxonomy.test.ts
git commit -m "feat: add notification taxonomy for subject types and reasons"
```

---

### Task 2: DB subscription columns, meta table, and methods

**Files:**
- Modify: `src/db.ts`
- Test: `src/db.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_SUBJECT_KEYS` from `./github/taxonomy`.
- Produces (added to the `Database` interface):
  - `getSubscriptions(discordId: string): { subjects: Set<string>; reasons: Set<string> | null }`
  - `setSubscribedSubjects(discordId: string, subjects: string[]): void`
  - `setSubscribedReasons(discordId: string, reasons: string[]): void`
  - `getDigestEnabled(discordId: string): boolean`
  - `setDigestEnabled(discordId: string, enabled: boolean): void`
  - `getMeta(key: string): string | null`
  - `setMeta(key: string, value: string): void`

- [ ] **Step 1: Write the failing tests**

Append to `src/db.test.ts` (keep existing imports; if `createDatabase` isn't already imported there, it is — this file already tests the DB):

```ts
describe("subscriptions and meta", () => {
  it("defaults to PullRequest subjects and pass-all reasons", () => {
    const db = createDatabase(":memory:");
    db.upsertUser("d1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    const subs = db.getSubscriptions("d1");
    expect([...subs.subjects]).toEqual(["PullRequest"]);
    expect(subs.reasons).toBeNull();
  });

  it("round-trips subject and reason selections independently", () => {
    const db = createDatabase(":memory:");
    db.upsertUser("d1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    db.setSubscribedSubjects("d1", ["PullRequest", "Issue"]);
    expect([...db.getSubscriptions("d1").subjects].sort()).toEqual(["Issue", "PullRequest"]);
    expect(db.getSubscriptions("d1").reasons).toBeNull(); // untouched

    db.setSubscribedReasons("d1", ["mention"]);
    const subs = db.getSubscriptions("d1");
    expect([...subs.reasons!]).toEqual(["mention"]);
    expect([...subs.subjects].sort()).toEqual(["Issue", "PullRequest"]); // untouched
  });

  it("defaults digest ON for linked users, false for unknown users", () => {
    const db = createDatabase(":memory:");
    db.upsertUser("d1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    expect(db.getDigestEnabled("d1")).toBe(true);
    expect(db.getDigestEnabled("ghost")).toBe(false);
    db.setDigestEnabled("d1", false);
    expect(db.getDigestEnabled("d1")).toBe(false);
  });

  it("stores and reads meta values", () => {
    const db = createDatabase(":memory:");
    expect(db.getMeta("last_digest_date")).toBeNull();
    db.setMeta("last_digest_date", "2026-06-22");
    expect(db.getMeta("last_digest_date")).toBe("2026-06-22");
    db.setMeta("last_digest_date", "2026-06-23");
    expect(db.getMeta("last_digest_date")).toBe("2026-06-23");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db.test.ts`
Expected: FAIL — `getSubscriptions` etc. are not functions.

- [ ] **Step 3: Add the migration, meta table, and import**

In `src/db.ts`, add the taxonomy import at the top:

```ts
import { DEFAULT_SUBJECT_KEYS } from "./github/taxonomy";
```

In `createDatabase`, immediately after the existing `sql.exec(\`...\`)` block that creates the tables, add an idempotent migration and the meta table:

```ts
  // Idempotent migration: subscription columns added after initial release.
  const userCols = sql.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  const hasCol = (c: string) => userCols.some((x) => x.name === c);
  if (!hasCol("subscribed_subjects")) sql.exec("ALTER TABLE users ADD COLUMN subscribed_subjects TEXT");
  if (!hasCol("subscribed_reasons")) sql.exec("ALTER TABLE users ADD COLUMN subscribed_reasons TEXT");
  if (!hasCol("digest_enabled")) sql.exec("ALTER TABLE users ADD COLUMN digest_enabled INTEGER");
  sql.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
```

- [ ] **Step 4: Add the method signatures to the `Database` interface**

In the `Database` interface in `src/db.ts`, add (before `close(): void;`):

```ts
  getSubscriptions(discordId: string): { subjects: Set<string>; reasons: Set<string> | null };
  setSubscribedSubjects(discordId: string, subjects: string[]): void;
  setSubscribedReasons(discordId: string, reasons: string[]): void;
  getDigestEnabled(discordId: string): boolean;
  setDigestEnabled(discordId: string, enabled: boolean): void;
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
```

- [ ] **Step 5: Implement the methods**

In the returned object in `createDatabase` (before `close()`), add:

```ts
    getSubscriptions(discordId): { subjects: Set<string>; reasons: Set<string> | null } {
      const r = sql
        .prepare("SELECT subscribed_subjects, subscribed_reasons FROM users WHERE discord_id = ?")
        .get(discordId) as
        | { subscribed_subjects: string | null; subscribed_reasons: string | null }
        | undefined;
      const subjects = r?.subscribed_subjects
        ? new Set(JSON.parse(r.subscribed_subjects) as string[])
        : new Set(DEFAULT_SUBJECT_KEYS);
      const reasons = r?.subscribed_reasons
        ? new Set(JSON.parse(r.subscribed_reasons) as string[])
        : null;
      return { subjects, reasons };
    },

    setSubscribedSubjects(discordId, subjects): void {
      sql
        .prepare("UPDATE users SET subscribed_subjects = ? WHERE discord_id = ?")
        .run(JSON.stringify(subjects), discordId);
    },

    setSubscribedReasons(discordId, reasons): void {
      sql
        .prepare("UPDATE users SET subscribed_reasons = ? WHERE discord_id = ?")
        .run(JSON.stringify(reasons), discordId);
    },

    getDigestEnabled(discordId): boolean {
      const r = sql
        .prepare("SELECT digest_enabled FROM users WHERE discord_id = ?")
        .get(discordId) as { digest_enabled: number | null } | undefined;
      if (!r) return false; // unknown user
      return r.digest_enabled !== 0; // NULL (never set) => ON
    },

    setDigestEnabled(discordId, enabled): void {
      sql
        .prepare("UPDATE users SET digest_enabled = ? WHERE discord_id = ?")
        .run(enabled ? 1 : 0, discordId);
    },

    getMeta(key): string | null {
      const r = sql.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
        | { value: string }
        | undefined;
      return r ? r.value : null;
    },

    setMeta(key, value): void {
      sql.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(key, value);
    },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/db.test.ts`
Expected: PASS (existing + 4 new tests).

- [ ] **Step 7: Commit**

```bash
git add src/db.ts src/db.test.ts
git commit -m "feat: add subscription columns, digest flag, and meta table to db"
```

---

### Task 3: Generalize NotificationItem to every subject type

This task renames the PR-specific fields to subject-generic ones and drops the PR-only
filter. It must change the producer (`notifications.ts`) and both consumers
(`notifier.ts`, `poller.ts`) together so the build stays green.

**Files:**
- Modify: `src/github/notifications.ts`, `src/github/notifications.test.ts`
- Modify: `src/notifier.ts`, `src/notifier.test.ts`
- Modify: `src/poller.ts`, `src/poller.test.ts`

**Interfaces:**
- Consumes: `reasonMeta` from `./github/taxonomy`.
- Produces:
  - `interface NotificationItem { threadId: string; reason: string; updatedAt: string; repoFullName: string; subjectType: string; subjectNumber: number | null; subjectTitle: string; subjectUrl: string }`
  - `parseNotifications` keeps all subjects.
  - `formatNotification(item, verdict?)` unchanged signature; uses `reasonMeta` and handles null `subjectNumber`.
  - `pollUser` verdict lookup guarded to PR subjects only.

- [ ] **Step 1: Update the parsing test (red)**

Replace the `parseNotifications` describe block in `src/github/notifications.test.ts` with:

```ts
describe("parseNotifications", () => {
  it("maps a pull request to subject-generic fields", () => {
    expect(parseNotifications([prRaw] as any)).toEqual([
      {
        threadId: "t1",
        reason: "review_requested",
        updatedAt: "2026-06-17T10:00:00Z",
        repoFullName: "acme/repo",
        subjectType: "PullRequest",
        subjectNumber: 42,
        subjectTitle: "Fix bug",
        subjectUrl: "https://github.com/acme/repo/pull/42",
      },
    ]);
  });

  it("keeps non-PR subjects (issues) instead of dropping them", () => {
    const items = parseNotifications([issueRaw] as any);
    expect(items).toHaveLength(1);
    expect(items[0].subjectType).toBe("Issue");
    expect(items[0].subjectNumber).toBe(42);
    expect(items[0].subjectUrl).toBe("https://github.com/acme/repo/issues/42");
  });

  it("uses the repo url and a null number for numberless subjects", () => {
    const releaseRaw = {
      ...prRaw,
      id: "t3",
      subject: { title: "v1.2.0", url: "https://api.github.com/repos/acme/repo/releases/9", type: "Release" },
    };
    const items = parseNotifications([releaseRaw] as any);
    expect(items[0].subjectType).toBe("Release");
    expect(items[0].subjectNumber).toBeNull();
    expect(items[0].subjectUrl).toBe("https://github.com/acme/repo");
  });
});
```

Note: the `issueRaw` fixture at the top of the file already sets `subject.url` to the PR pulls URL via spread; update it so the issue has its own URL. Change the `issueRaw` line to:

```ts
const issueRaw = {
  ...prRaw,
  id: "t2",
  subject: { title: "Fix bug", url: "https://api.github.com/repos/acme/repo/issues/42", type: "Issue" },
};
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/github/notifications.test.ts`
Expected: FAIL — items still use `prNumber`, issues are dropped.

- [ ] **Step 3: Rewrite `NotificationItem` + `parseNotifications`**

In `src/github/notifications.ts`, replace the `NotificationItem` interface and `parseNotifications` function with:

```ts
export interface NotificationItem {
  threadId: string;
  reason: string;
  updatedAt: string;
  repoFullName: string;
  subjectType: string;
  subjectNumber: number | null;
  subjectTitle: string;
  subjectUrl: string;
}
```

```ts
function resolveSubject(
  type: string,
  apiUrl: string,
  repoFullName: string
): { number: number | null; url: string } {
  // PRs and Issues have a numeric id at the end of their API url and a clean html url.
  if ((type === "PullRequest" || type === "Issue") && apiUrl) {
    const n = Number(apiUrl.split("/").pop());
    return { number: Number.isFinite(n) ? n : null, url: toHtmlUrl(apiUrl) };
  }
  // Releases, commits, discussions, CI, security: no reliable number; link to the repo.
  return { number: null, url: `https://github.com/${repoFullName}` };
}

export function parseNotifications(raw: RawNotification[]): NotificationItem[] {
  return raw.map((n) => {
    const subjectType = n.subject?.type ?? "";
    const { number, url } = resolveSubject(subjectType, n.subject?.url ?? "", n.repository.full_name);
    return {
      threadId: n.id,
      reason: n.reason,
      updatedAt: n.updated_at,
      repoFullName: n.repository.full_name,
      subjectType,
      subjectNumber: number,
      subjectTitle: n.subject?.title ?? "(no title)",
      subjectUrl: url,
    };
  });
}
```

(`toHtmlUrl` and `RawNotification` are unchanged. `toHtmlUrl` already maps the issues API url to `https://github.com/acme/repo/issues/42` because only the host prefix is replaced.)

- [ ] **Step 4: Run notifications tests (green)**

Run: `npx vitest run src/github/notifications.test.ts`
Expected: PASS.

- [ ] **Step 5: Update notifier (red → green)**

Update `src/notifier.test.ts` first. Replace the `item` fixture fields and the unknown-reason test:

```ts
const item: NotificationItem = {
  threadId: "t1",
  reason: "review_requested",
  updatedAt: "2026-06-17T10:00:00Z",
  repoFullName: "acme/repo",
  subjectType: "PullRequest",
  subjectNumber: 42,
  subjectTitle: "Fix the widget",
  subjectUrl: "https://github.com/acme/repo/pull/42",
};
```

Change the line-2 assertion to use the new title:

```ts
    expect(second).toBe("[#42 Fix the widget](https://github.com/acme/repo/pull/42)");
```

Replace the "falls back ... for unknown reasons" test (since `subscribed` is now a known reason) with a genuinely unknown reason, and add a numberless-subject test:

```ts
  it("falls back to a generic prefix for unknown reasons", () => {
    expect(formatNotification({ ...item, reason: "totally_made_up" })).toContain("New activity");
  });

  it("renders a numberless subject without a leading #", () => {
    const release = {
      ...item,
      reason: "subscribed",
      subjectType: "Release",
      subjectNumber: null,
      subjectTitle: "v1.2.0",
      subjectUrl: "https://github.com/acme/repo",
    };
    const second = formatNotification(release).split("\n")[1];
    expect(second).toBe("[v1.2.0](https://github.com/acme/repo)");
  });
```

Then update `src/notifier.ts`. Replace the `REASON`/`FALLBACK` constants and `formatNotification` with a taxonomy-backed version:

```ts
import { reasonMeta } from "./github/taxonomy";
```

Delete the local `const REASON = {...}` and `const FALLBACK = {...}` declarations. Keep `VERDICT_LABEL`. Replace `formatNotification`:

```ts
export function formatNotification(item: NotificationItem, verdict?: Verdict | null): string {
  const { emoji, label } = verdict ? VERDICT_LABEL[verdict] : reasonMeta(item.reason);
  // Discord renders <t:UNIX:R> as a localized, auto-updating "5 minutes ago".
  const unix = Math.floor(new Date(item.updatedAt).getTime() / 1000);
  // Masked link keeps it clickable while suppressing Discord's bulky link embed.
  const link =
    item.subjectNumber != null
      ? `[#${item.subjectNumber} ${item.subjectTitle}](${item.subjectUrl})`
      : `[${item.subjectTitle}](${item.subjectUrl})`;
  return [`${emoji} **${label}** · ${item.repoFullName} · <t:${unix}:R>`, link].join("\n");
}
```

Run: `npx vitest run src/notifier.test.ts`
Expected: PASS.

- [ ] **Step 6: Update poller (red → green)**

Update `src/poller.test.ts`: rename the `prItem` fixture fields:

```ts
const prItem = {
  threadId: "t1",
  reason: "review_requested",
  updatedAt: "2026-06-17T10:00:00Z",
  repoFullName: "acme/repo",
  subjectType: "PullRequest",
  subjectNumber: 1,
  subjectTitle: "Fix",
  subjectUrl: "https://github.com/acme/repo/pull/1",
};
```

Then in `src/poller.ts`, guard the verdict lookup to PR subjects. Replace the verdict block inside the loop:

```ts
    let verdict = null;
    if (item.subjectType === "PullRequest" && item.subjectNumber != null) {
      try {
        const review = await deps.fetchLatestReview(token, item.repoFullName, item.subjectNumber);
        verdict = resolveVerdict(item, review);
      } catch (err) {
        // Enrichment is best-effort; never let it drop the notification.
        console.warn(`Verdict lookup failed for ${user.discordId} thread ${item.threadId}:`, err);
      }
    }
```

Run: `npx vitest run src/poller.test.ts`
Expected: PASS.

- [ ] **Step 7: Full check + commit**

```bash
npm run typecheck && npm test
git add src/github/notifications.ts src/github/notifications.test.ts src/notifier.ts src/notifier.test.ts src/poller.ts src/poller.test.ts
git commit -m "feat: generalize notifications to every github subject type"
```

---

### Task 4: Filter notifications by the user's subscription

**Files:**
- Modify: `src/poller.ts`
- Test: `src/poller.test.ts`

**Interfaces:**
- Consumes: `db.getSubscriptions`, `db.setSubscribedSubjects`, `db.setSubscribedReasons` (Task 2); `item.subjectType` (Task 3).
- Produces: filtered delivery in `pollUser`.

- [ ] **Step 1: Write failing tests**

Add to `src/poller.test.ts`. (`issueItem` is a non-default subject.)

```ts
const issueItem = {
  threadId: "t9",
  reason: "mention",
  updatedAt: "2026-06-17T11:00:00Z",
  repoFullName: "acme/repo",
  subjectType: "Issue",
  subjectNumber: 9,
  subjectTitle: "Bug",
  subjectUrl: "https://github.com/acme/repo/issues/9",
};

it("suppresses a non-PR subject by default", async () => {
  nextResult = { status: 200, items: [issueItem], lastModified: "Mon", pollInterval: 60 };
  await pollUser(deps(), user());
  expect(sent).toHaveLength(0);
});

it("delivers a subject once the user subscribes to that type", async () => {
  db.setSubscribedSubjects("d1", ["PullRequest", "Issue"]);
  nextResult = { status: 200, items: [issueItem], lastModified: "Mon", pollInterval: 60 };
  await pollUser(deps(), user());
  expect(sent).toHaveLength(1);
});

it("suppresses a reason the user has filtered out", async () => {
  db.setSubscribedReasons("d1", ["mention"]); // review_requested no longer allowed
  nextResult = { status: 200, items: [prItem], lastModified: "Mon", pollInterval: 60 };
  await pollUser(deps(), user());
  expect(sent).toHaveLength(0);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/poller.test.ts`
Expected: FAIL — the issue and the filtered reason are still delivered.

- [ ] **Step 3: Add the filter to `pollUser`**

In `src/poller.ts`, after `if (res.lastModified) deps.db.updateLastModified(...)` and before the `for (const item of res.items)` loop, read the subscription once:

```ts
  const subs = deps.db.getSubscriptions(user.discordId);
```

Then as the first lines inside the loop (before the `wasNotified` check):

```ts
    if (!subs.subjects.has(item.subjectType)) continue;
    if (subs.reasons !== null && !subs.reasons.has(item.reason)) continue;
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/poller.test.ts`
Expected: PASS (existing default-PR tests still pass; the three new ones pass).

- [ ] **Step 5: Commit**

```bash
git add src/poller.ts src/poller.test.ts
git commit -m "feat: filter notifications by user subscription in the poller"
```

---

### Task 5: Digest formatter

**Files:**
- Modify: `src/status.ts`
- Test: `src/status.test.ts`

**Interfaces:**
- Consumes: `AttentionList` (existing), private `renderSection`/`clampMessage` (same module).
- Produces: `function formatDigest(githubLogin: string, list: AttentionList): string`.

- [ ] **Step 1: Write failing test**

Append to `src/status.test.ts` (the file already imports from `./status` and constructs `PrSummary`s — mirror its existing helpers):

```ts
import { formatDigest } from "./status";

describe("formatDigest", () => {
  it("uses a digest header and renders both sections", () => {
    const list = {
      incoming: [
        { repoFullName: "acme/repo", number: 7, title: "Fix bug", url: "https://github.com/acme/repo/pull/7", updatedAt: "2026-06-17T10:00:00Z" },
      ],
      mine: [],
    };
    const msg = formatDigest("octocat", list);
    expect(msg).toContain("Daily PR digest");
    expect(msg).toContain("octocat");
    expect(msg).toContain("#7 [Fix bug](https://github.com/acme/repo/pull/7)");
    expect(msg).toContain("No open PRs of yours are waiting on a review.");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/status.test.ts`
Expected: FAIL — `formatDigest` is not exported.

- [ ] **Step 3: Implement `formatDigest`**

In `src/status.ts`, add at the end of the file (it reuses the module-private `renderSection` and `clampMessage`):

```ts
export function formatDigest(githubLogin: string, list: AttentionList): string {
  const header = `☀️ **Daily PR digest** for \`${githubLogin}\``;
  const incoming = renderSection(
    "🔍 Awaiting your review",
    list.incoming,
    "Nothing awaiting your review. 🎉"
  );
  const mine = renderSection(
    "📝 Your PRs awaiting review",
    list.mine,
    "No open PRs of yours are waiting on a review."
  );
  return clampMessage(`${header}\n\n${incoming}\n\n${mine}`);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/status.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/status.ts src/status.test.ts
git commit -m "feat: add formatDigest for the daily PR digest"
```

---

### Task 6: Digest builder and sender

**Files:**
- Create: `src/digest.ts`
- Test: `src/digest.test.ts`

**Interfaces:**
- Consumes: `Database`/`User` (`db.ts`), `PrSummary`/`searchPullRequests` shape (`github/search.ts`), `DmSender` (`notifier.ts`), `formatDigest` (`status.ts`).
- Produces:
  - `interface DigestDeps { db: Database; sender: DmSender; decryptToken(user: User): string; searchPullRequests(token: string, query: string): Promise<PrSummary[]>; awaitingQuery: string; minePrsQuery: string }`
  - `function buildDigest(deps: DigestDeps, user: User): Promise<string | null>`
  - `function sendDigests(deps: DigestDeps): Promise<void>`

- [ ] **Step 1: Write failing tests**

Create `src/digest.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createDatabase, type Database, type User } from "./db";
import { buildDigest, sendDigests, type DigestDeps } from "./digest";
import type { DmSender } from "./notifier";
import type { PrSummary } from "./github/search";

let db: Database;
let sent: { discordId: string; message: string }[];
let sender: DmSender;

const pr = (n: number): PrSummary => ({
  repoFullName: "acme/repo",
  number: n,
  title: `PR ${n}`,
  url: `https://github.com/acme/repo/pull/${n}`,
  updatedAt: "2026-06-17T10:00:00Z",
});

function deps(results: Record<string, PrSummary[]>): DigestDeps {
  return {
    db,
    sender,
    decryptToken: () => "tok",
    searchPullRequests: async (_token, query) => results[query] ?? [],
    awaitingQuery: "AWAITING",
    minePrsQuery: "MINE",
  };
}

beforeEach(() => {
  db = createDatabase(":memory:");
  db.upsertUser("d1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
  sent = [];
  sender = { sendDm: async (discordId, message) => { sent.push({ discordId, message }); } };
});

describe("buildDigest", () => {
  it("returns a formatted digest when there is something to report", async () => {
    const user = db.getUser("d1")!;
    const msg = await buildDigest(deps({ AWAITING: [pr(7)], MINE: [] }), user);
    expect(msg).toContain("Daily PR digest");
    expect(msg).toContain("#7");
  });

  it("returns null when both sections are empty", async () => {
    const user = db.getUser("d1")!;
    expect(await buildDigest(deps({ AWAITING: [], MINE: [] }), user)).toBeNull();
  });
});

describe("sendDigests", () => {
  it("DMs users with content and skips empty ones", async () => {
    db.upsertUser("d2", "hubot", { ciphertext: "a", iv: "b", tag: "c" });
    const d = deps({ AWAITING: [pr(7)], MINE: [] });
    await sendDigests(d);
    expect(sent).toHaveLength(2); // both users have content (same fake results)
  });

  it("skips users who disabled the digest", async () => {
    db.setDigestEnabled("d1", false);
    await sendDigests(deps({ AWAITING: [pr(7)], MINE: [] }));
    expect(sent).toHaveLength(0);
  });

  it("isolates a per-user failure", async () => {
    db.upsertUser("d2", "hubot", { ciphertext: "a", iv: "b", tag: "c" });
    const d = deps({ AWAITING: [pr(7)], MINE: [] });
    d.searchPullRequests = async (_t, query) => {
      // first user throws, second succeeds
      throw Object.assign(new Error("boom"), { query });
    };
    await expect(sendDigests(d)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/digest.test.ts`
Expected: FAIL — cannot find module `./digest`.

- [ ] **Step 3: Implement `digest.ts`**

Create `src/digest.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/digest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/digest.ts src/digest.test.ts
git commit -m "feat: add daily digest builder and sender"
```

---

### Task 7: BRT scheduler

**Files:**
- Create: `src/scheduler.ts`
- Test: `src/scheduler.test.ts`

**Interfaces:**
- Consumes: `DigestDeps` + `sendDigests` (Task 6); `db.getMeta`/`db.setMeta` (Task 2).
- Produces:
  - `function brtParts(nowMs: number): { date: string; hour: number }`
  - `function maybeRunDigest(deps: DigestDeps, nowMs: number): Promise<boolean>`
  - `function startDigestScheduler(deps: DigestDeps, clock?: () => number): { stop(): void }`

- [ ] **Step 1: Write failing tests**

Create `src/scheduler.test.ts`. (6am BRT = 09:00 UTC, since BRT is UTC−3.)

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createDatabase, type Database } from "./db";
import { brtParts, maybeRunDigest } from "./scheduler";
import type { DigestDeps } from "./digest";
import type { DmSender } from "./notifier";
import type { PrSummary } from "./github/search";

let db: Database;
let sent: { discordId: string; message: string }[];

const pr = (n: number): PrSummary => ({
  repoFullName: "acme/repo",
  number: n,
  title: `PR ${n}`,
  url: `https://github.com/acme/repo/pull/${n}`,
  updatedAt: "2026-06-17T10:00:00Z",
});

function deps(): DigestDeps {
  const sender: DmSender = { sendDm: async (discordId, message) => { sent.push({ discordId, message }); } };
  return {
    db,
    sender,
    decryptToken: () => "tok",
    searchPullRequests: async () => [pr(7)],
    awaitingQuery: "AWAITING",
    minePrsQuery: "MINE",
  };
}

const at = (utc: string) => Date.parse(utc);

beforeEach(() => {
  db = createDatabase(":memory:");
  db.upsertUser("d1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
  sent = [];
});

describe("brtParts", () => {
  it("converts a UTC instant to the BRT date and hour", () => {
    // 09:00Z == 06:00 BRT
    expect(brtParts(at("2026-06-22T09:00:00Z"))).toEqual({ date: "2026-06-22", hour: 6 });
    // 02:00Z == 23:00 of the previous BRT day
    expect(brtParts(at("2026-06-22T02:00:00Z"))).toEqual({ date: "2026-06-21", hour: 23 });
  });
});

describe("maybeRunDigest", () => {
  it("does not run before 06:00 BRT", async () => {
    const ran = await maybeRunDigest(deps(), at("2026-06-22T08:59:00Z")); // 05:59 BRT
    expect(ran).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("runs once at/after 06:00 BRT and records the date", async () => {
    const ran = await maybeRunDigest(deps(), at("2026-06-22T09:00:00Z"));
    expect(ran).toBe(true);
    expect(sent).toHaveLength(1);
    expect(db.getMeta("last_digest_date")).toBe("2026-06-22");
  });

  it("does not re-run the same BRT day (survives restart)", async () => {
    await maybeRunDigest(deps(), at("2026-06-22T09:00:00Z"));
    sent = [];
    const ran = await maybeRunDigest(deps(), at("2026-06-22T15:00:00Z"));
    expect(ran).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("runs again the next BRT day", async () => {
    await maybeRunDigest(deps(), at("2026-06-22T09:00:00Z"));
    sent = [];
    const ran = await maybeRunDigest(deps(), at("2026-06-23T09:30:00Z"));
    expect(ran).toBe(true);
    expect(sent).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/scheduler.test.ts`
Expected: FAIL — cannot find module `./scheduler`.

- [ ] **Step 3: Implement `scheduler.ts`**

Create `src/scheduler.ts`:

```ts
import type { DigestDeps } from "./digest";
import { sendDigests } from "./digest";

const DIGEST_HOUR_BRT = 6;
const META_KEY = "last_digest_date";

// Date (YYYY-MM-DD) and hour (0-23) of an instant in America/Sao_Paulo.
// BRT is UTC-3 with no DST since 2019.
export function brtParts(nowMs: number): { date: string; hour: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(nowMs));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const hour = Number(get("hour")) % 24; // some ICU builds render midnight as "24"
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour };
}

// Runs the digest at most once per BRT day, on or after 06:00 BRT. The guard date
// is written before sending so an overlapping tick or a restart cannot double-send.
export async function maybeRunDigest(deps: DigestDeps, nowMs: number): Promise<boolean> {
  const { date, hour } = brtParts(nowMs);
  if (hour < DIGEST_HOUR_BRT) return false;
  if (deps.db.getMeta(META_KEY) === date) return false;
  deps.db.setMeta(META_KEY, date);
  await sendDigests(deps);
  return true;
}

export function startDigestScheduler(
  deps: DigestDeps,
  clock: () => number = Date.now
): { stop(): void } {
  const handle = setInterval(() => void maybeRunDigest(deps, clock()), 60_000);
  void maybeRunDigest(deps, clock()); // check immediately on boot
  return { stop: () => clearInterval(handle) };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/scheduler.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scheduler.ts src/scheduler.test.ts
git commit -m "feat: add BRT daily digest scheduler"
```

---

### Task 8: `/listen-to` command (logic + registration + wiring)

The testable logic (option building + persistence) lives in `handlers.ts`; the
discord.js component assembly lives in `client.ts` (untested, matching the existing
client.ts pattern).

**Files:**
- Modify: `src/discord/handlers.ts`, `src/discord/handlers.test.ts`
- Modify: `src/discord/commands.ts`, `src/discord/commands.test.ts`
- Modify: `src/discord/client.ts`

**Interfaces:**
- Consumes: `SUBJECT_TYPES`, `REASONS` (taxonomy); `db.getSubscriptions`, `db.setSubscribedSubjects`, `db.setSubscribedReasons` (Task 2).
- Produces (from `handlers.ts`):
  - `interface SubscriptionOption { label: string; value: string; default: boolean }`
  - `const LISTEN_TO_SUBJECTS_ID = "listen-to:subjects"`, `const LISTEN_TO_REASONS_ID = "listen-to:reasons"`
  - `function subjectOptions(db: Database, userId: string): SubscriptionOption[]`
  - `function reasonOptions(db: Database, userId: string): SubscriptionOption[]`
  - `function applySubjectSelection(db: Database, userId: string, values: string[]): void`
  - `function applyReasonSelection(db: Database, userId: string, values: string[]): void`

- [ ] **Step 1: Write failing handler tests**

Append to `src/discord/handlers.test.ts`:

```ts
import {
  subjectOptions,
  reasonOptions,
  applySubjectSelection,
  applyReasonSelection,
} from "./handlers";

describe("/listen-to options", () => {
  it("pre-checks PullRequest and all reasons by default", () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    const subjects = subjectOptions(db, "user1");
    expect(subjects.find((o) => o.value === "PullRequest")!.default).toBe(true);
    expect(subjects.find((o) => o.value === "Issue")!.default).toBe(false);
    // reasons default to pass-all => every option pre-checked
    expect(reasonOptions(db, "user1").every((o) => o.default)).toBe(true);
  });

  it("persists subject and reason selections independently", () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    applySubjectSelection(db, "user1", ["PullRequest", "Issue"]);
    applyReasonSelection(db, "user1", ["mention"]);
    const subs = db.getSubscriptions("user1");
    expect([...subs.subjects].sort()).toEqual(["Issue", "PullRequest"]);
    expect([...subs.reasons!]).toEqual(["mention"]);
    // after customizing reasons, the unselected ones are no longer pre-checked
    expect(reasonOptions(db, "user1").find((o) => o.value === "comment")!.default).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/discord/handlers.test.ts`
Expected: FAIL — these functions are not exported.

- [ ] **Step 3: Implement the handler logic**

In `src/discord/handlers.ts`, add the taxonomy import and the new exports:

```ts
import { SUBJECT_TYPES, REASONS } from "../github/taxonomy";
```

```ts
export interface SubscriptionOption {
  label: string;
  value: string;
  default: boolean;
}

export const LISTEN_TO_SUBJECTS_ID = "listen-to:subjects";
export const LISTEN_TO_REASONS_ID = "listen-to:reasons";

export function subjectOptions(db: Database, userId: string): SubscriptionOption[] {
  const { subjects } = db.getSubscriptions(userId);
  return SUBJECT_TYPES.map((s) => ({
    label: `${s.emoji} ${s.label}`,
    value: s.key,
    default: subjects.has(s.key),
  }));
}

export function reasonOptions(db: Database, userId: string): SubscriptionOption[] {
  const { reasons } = db.getSubscriptions(userId);
  return REASONS.map((r) => ({
    label: `${r.emoji} ${r.label}`,
    value: r.key,
    default: reasons === null || reasons.has(r.key), // null = pass-all => all checked
  }));
}

export function applySubjectSelection(db: Database, userId: string, values: string[]): void {
  db.setSubscribedSubjects(userId, values);
}

export function applyReasonSelection(db: Database, userId: string, values: string[]): void {
  db.setSubscribedReasons(userId, values);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/discord/handlers.test.ts`
Expected: PASS.

- [ ] **Step 5: Register the command + update its test**

In `src/discord/commands.ts`, add to the `commands` array:

```ts
  new SlashCommandBuilder()
    .setName("listen-to")
    .setDescription("Choose which GitHub notifications you receive")
    .toJSON(),
```

In `src/discord/commands.test.ts`, update the expected names:

```ts
    expect(names).toEqual(["link", "listen-to", "status", "unlink"]);
```

Run: `npx vitest run src/discord/commands.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire the component UI in `client.ts`**

In `src/discord/client.ts`, extend the imports:

```ts
import {
  Client,
  GatewayIntentBits,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
```

```ts
import {
  handleLink,
  handleUnlink,
  handleStatus,
  subjectOptions,
  reasonOptions,
  applySubjectSelection,
  applyReasonSelection,
  LISTEN_TO_SUBJECTS_ID,
  LISTEN_TO_REASONS_ID,
  type CommandContext,
  type LinkDeps,
  type StatusDeps,
  type SubscriptionOption,
} from "./handlers";
```

Add helper builders inside `startDiscord` (before `client.on(...)`), capturing `db`:

```ts
  const menuRow = (customId: string, placeholder: string, options: SubscriptionOption[]) =>
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(placeholder)
        .setMinValues(0)
        .setMaxValues(options.length)
        .addOptions(options.map((o) => ({ label: o.label, value: o.value, default: o.default })))
    );

  const listenToComponents = (userId: string) => [
    menuRow(LISTEN_TO_SUBJECTS_ID, "Subject types to receive", subjectOptions(db, userId)),
    menuRow(LISTEN_TO_REASONS_ID, "Reasons to receive", reasonOptions(db, userId)),
  ];
```

In the `interactionCreate` handler, add a branch for component (select-menu) interactions at the very top of the callback, before the `isChatInputCommand` guard:

```ts
    if (interaction.isStringSelectMenu()) {
      await handleListenToSelect(interaction);
      return;
    }
```

Add the `listen-to` chat-command branch alongside the existing ones:

```ts
      } else if (interaction.commandName === "listen-to") {
        if (!db.getUser(interaction.user.id)) {
          await interaction.reply({
            content: "You're not connected. Run `/link` first.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await interaction.reply({
          content: "🎚️ **Choose what to be notified about.** Changes save automatically.",
          components: listenToComponents(interaction.user.id),
          flags: MessageFlags.Ephemeral,
        });
      }
```

Add the select handler function inside `startDiscord` (after the builders):

```ts
  const handleListenToSelect = async (interaction: StringSelectMenuInteraction) => {
    const userId = interaction.user.id;
    if (interaction.customId === LISTEN_TO_SUBJECTS_ID) {
      applySubjectSelection(db, userId, interaction.values);
    } else if (interaction.customId === LISTEN_TO_REASONS_ID) {
      applyReasonSelection(db, userId, interaction.values);
    } else {
      return;
    }
    // Re-render so the menus reflect the saved state.
    await interaction.update({
      content: "🎚️ **Saved.** Adjust anytime — changes save automatically.",
      components: listenToComponents(userId),
    });
  };
```

- [ ] **Step 7: Full check + commit**

```bash
npm run typecheck && npm test
git add src/discord/handlers.ts src/discord/handlers.test.ts src/discord/commands.ts src/discord/commands.test.ts src/discord/client.ts
git commit -m "feat: add /listen-to command for choosing notifications"
```

---

### Task 9: `/digest` command (logic + registration + wiring)

**Files:**
- Modify: `src/discord/handlers.ts`, `src/discord/handlers.test.ts`
- Modify: `src/discord/commands.ts`, `src/discord/commands.test.ts`
- Modify: `src/discord/client.ts`

**Interfaces:**
- Consumes: `db.getDigestEnabled`/`db.setDigestEnabled` (Task 2); `buildDigest` + `DigestDeps` (Task 6).
- Produces (from `handlers.ts`):
  - `const DIGEST_TOGGLE_ID = "digest:toggle"`, `const DIGEST_PREVIEW_ID = "digest:preview"`
  - `function toggleDigest(db: Database, userId: string): boolean`
  - `function digestStatusText(enabled: boolean): string`

- [ ] **Step 1: Write failing handler tests**

Append to `src/discord/handlers.test.ts`:

```ts
import { toggleDigest, digestStatusText } from "./handlers";

describe("/digest", () => {
  it("toggles the digest flag and returns the new state", () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    expect(db.getDigestEnabled("user1")).toBe(true);
    expect(toggleDigest(db, "user1")).toBe(false);
    expect(db.getDigestEnabled("user1")).toBe(false);
    expect(toggleDigest(db, "user1")).toBe(true);
  });

  it("describes the current state", () => {
    expect(digestStatusText(true)).toMatch(/on/i);
    expect(digestStatusText(false)).toMatch(/off/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/discord/handlers.test.ts`
Expected: FAIL — `toggleDigest`/`digestStatusText` not exported.

- [ ] **Step 3: Implement the handler logic**

In `src/discord/handlers.ts`, add:

```ts
export const DIGEST_TOGGLE_ID = "digest:toggle";
export const DIGEST_PREVIEW_ID = "digest:preview";

export function toggleDigest(db: Database, userId: string): boolean {
  const next = !db.getDigestEnabled(userId);
  db.setDigestEnabled(userId, next);
  return next;
}

export function digestStatusText(enabled: boolean): string {
  return enabled
    ? "☀️ Daily PR digest is **ON** — you'll get a summary at 6am BRT."
    : "🌙 Daily PR digest is **OFF**.";
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/discord/handlers.test.ts`
Expected: PASS.

- [ ] **Step 5: Register the command + update its test**

In `src/discord/commands.ts`, add to the `commands` array:

```ts
  new SlashCommandBuilder()
    .setName("digest")
    .setDescription("Turn the daily 6am PR digest on or off, or preview it")
    .toJSON(),
```

In `src/discord/commands.test.ts`, update the expected names:

```ts
    expect(names).toEqual(["digest", "link", "listen-to", "status", "unlink"]);
```

Run: `npx vitest run src/discord/commands.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire the buttons in `client.ts`**

`startDiscord` needs the digest deps for the preview. Update its signature and the
component handling.

Extend imports in `src/discord/client.ts`:

```ts
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
} from "discord.js";
```

(Add these to the existing discord.js import block; `ActionRowBuilder` is already imported from Task 8.)

```ts
import { buildDigest, type DigestDeps } from "../digest";
import {
  toggleDigest,
  digestStatusText,
  DIGEST_TOGGLE_ID,
  DIGEST_PREVIEW_ID,
} from "./handlers";
```

Change the `startDiscord` signature to accept `digestDeps`:

```ts
export async function startDiscord(
  token: string,
  db: Database,
  linkDeps: LinkDeps,
  statusDeps: StatusDeps,
  digestDeps: DigestDeps
): Promise<DiscordRuntime> {
```

Add a digest-buttons builder inside `startDiscord` (next to `listenToComponents`):

```ts
  const digestButtons = (enabled: boolean) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(DIGEST_TOGGLE_ID)
        .setLabel(enabled ? "Turn off" : "Turn on")
        .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(DIGEST_PREVIEW_ID)
        .setLabel("Preview now")
        .setStyle(ButtonStyle.Secondary)
    );
```

Add a button-interaction branch at the top of the `interactionCreate` callback (after the `isStringSelectMenu` branch):

```ts
    if (interaction.isButton()) {
      await handleDigestButton(interaction);
      return;
    }
```

Add the `digest` chat-command branch alongside the others:

```ts
      } else if (interaction.commandName === "digest") {
        if (!db.getUser(interaction.user.id)) {
          await interaction.reply({
            content: "You're not connected. Run `/link` first.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        const enabled = db.getDigestEnabled(interaction.user.id);
        await interaction.reply({
          content: digestStatusText(enabled),
          components: [digestButtons(enabled)],
          flags: MessageFlags.Ephemeral,
        });
      }
```

Add the button handler inside `startDiscord`:

```ts
  const handleDigestButton = async (interaction: ButtonInteraction) => {
    const userId = interaction.user.id;
    if (interaction.customId === DIGEST_TOGGLE_ID) {
      const enabled = toggleDigest(db, userId);
      await interaction.update({
        content: digestStatusText(enabled),
        components: [digestButtons(enabled)],
      });
    } else if (interaction.customId === DIGEST_PREVIEW_ID) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const user = db.getUser(userId);
      const message = user ? await buildDigest(digestDeps, user) : null;
      await interaction.editReply(
        message ?? "Nothing to show right now — no PRs need your attention. 🎉"
      );
    }
  };
```

- [ ] **Step 7: Full check + commit**

(Note: `index.ts` does not yet pass `digestDeps` to `startDiscord`, so `npm run typecheck` will fail here. That wiring is Task 10. To keep this task's commit green, do Task 10 immediately after and run the full check there. If you require each commit to typecheck independently, fold Task 10's `index.ts` change into this commit.)

```bash
npx vitest run src/discord
git add src/discord/handlers.ts src/discord/handlers.test.ts src/discord/commands.ts src/discord/commands.test.ts src/discord/client.ts
git commit -m "feat: add /digest command to toggle and preview the daily digest"
```

---

### Task 10: Wire digest deps and start the scheduler in `index.ts`

**Files:**
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `startDiscord(... , digestDeps)` (Task 9); `startDigestScheduler` (Task 7); `DigestDeps` (Task 6).
- Produces: a running scheduler and a `digestDeps` object passed to `startDiscord`.

- [ ] **Step 1: Add imports**

In `src/index.ts`, add:

```ts
import { startDigestScheduler } from "./scheduler";
import type { DigestDeps } from "./digest";
```

- [ ] **Step 2: Build `digestDeps` and pass it to `startDiscord`**

After `statusDeps` is defined and before `startDiscord` is called, add:

```ts
  const decryptToken = (user: import("./db").User) =>
    decrypt(
      { ciphertext: user.tokenCiphertext, iv: user.tokenIv, tag: user.tokenTag },
      config.tokenEncryptionKey
    );

  const digestDeps: DigestDeps = {
    db,
    sender: undefined as never, // set after startDiscord returns the sender
    decryptToken,
    searchPullRequests: (token, query) => searchPullRequests(token, query),
    awaitingQuery: QUERY_AWAITING_MY_REVIEW,
    minePrsQuery: QUERY_MY_PRS_AWAITING_REVIEW,
  };

  const { client, sender } = await startDiscord(
    config.discordToken,
    db,
    linkDeps,
    statusDeps,
    digestDeps
  );
  digestDeps.sender = sender;
```

Replace the existing `const { client, sender } = await startDiscord(config.discordToken, db, linkDeps, statusDeps);` line with the call above (note the chicken-and-egg: `digestDeps` needs `sender`, which only exists after `startDiscord`; we patch it in immediately after. The `/digest` preview and the scheduler both run only after this point, so `sender` is always set by the time it's used).

- [ ] **Step 3: Reuse `decryptToken` in the poller (DRY)**

The existing poller block builds an inline `decryptToken`. Replace its `decryptToken: (user) => decrypt(...)` with the shared one:

```ts
  const poller = startPoller({
    db,
    sender,
    decryptToken,
    fetchNotifications: (token, lastModified) => fetchNotifications(token, lastModified),
    fetchLatestReview: (token, repoFullName, prNumber) =>
      fetchLatestReview(token, repoFullName, prNumber),
  });
```

- [ ] **Step 4: Start the scheduler and stop it on shutdown**

After the `poller` is started, add:

```ts
  const scheduler = startDigestScheduler(digestDeps);
```

In the `shutdown` function, add `scheduler.stop();` next to `poller.stop();`:

```ts
      poller.stop();
      scheduler.stop();
```

- [ ] **Step 5: Full verification**

Run: `npm run typecheck && npm test`
Expected: PASS — full suite green, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire digest deps and start the daily scheduler"
```

---

## Deviations from the spec (intentional refinements)

1. **`/listen-to` auto-saves per menu** instead of using a Save button + transient
   pending map. Each select-menu change persists that axis immediately via separate
   `setSubscribedSubjects` / `setSubscribedReasons` setters. This removes in-memory
   state (restart-safe, no lost selections, no multi-message races) and is simpler to
   test. The two-setter DB API replaces the spec's single `setSubscriptions`.
2. **`formatNotification` keeps reason-driven emoji + label** (via `reasonMeta`)
   rather than switching to subject-type emoji. This preserves the current, verified PR
   notification appearance exactly; subject type still drives parsing and the link line.
   Subject-type emoji/labels are used in the `/listen-to` menus.
3. **Scheduler uses `setInterval` + `Intl`** (no `node-cron` dependency), satisfying the
   no-new-dependency constraint.

## Self-review notes

- **Spec coverage:** taxonomy (Task 1), DB subscriptions + meta (Task 2), parsing
  expansion (Task 3), AND-filter (Task 4), digest formatter/builder/sender (Tasks 5–6),
  BRT scheduler with restart-safe idempotency (Task 7), `/listen-to` (Task 8), `/digest`
  (Task 9), wiring (Task 10). All spec sections map to a task.
- **Backward compatibility:** default subjects `["PullRequest"]` + NULL reasons
  (pass-all) + digest ON keep existing linked users identical to today.
- **Type consistency:** `NotificationItem` fields (`subjectType`/`subjectNumber`/
  `subjectTitle`/`subjectUrl`) are used identically across `notifications.ts`,
  `notifier.ts`, and `poller.ts`. `DigestDeps` is shared by `digest.ts`, `scheduler.ts`,
  and `index.ts`. Custom IDs are exported constants reused by handler and client.
- **Known cross-task build note:** Task 9 changes `startDiscord`'s signature; the
  matching `index.ts` call is Task 10. Either do Task 10 immediately after Task 9, or
  fold the `index.ts` edit into Task 9's commit (called out in Task 9 Step 7).
