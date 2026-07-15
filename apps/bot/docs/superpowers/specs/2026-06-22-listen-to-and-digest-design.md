# Design: `/listen-to` subscriptions + daily PR digest

**Date:** 2026-06-22
**Status:** Approved — ready for implementation planning

## Summary

Two features for the Discord ↔ GitHub PR notification bot:

1. **`/listen-to`** — expand notification support from PR-only to **every** GitHub
   notification subject type, and let each user choose which subject types and
   reasons they want delivered, via an interactive Discord command.
2. **Daily digest** — a job that runs every day at **06:00 BRT** (America/São_Paulo,
   UTC−3) and DMs each linked user a current-state snapshot of the PRs that need
   their attention (PRs they authored + PRs they're requested to review), toggleable
   via a `/digest` command.

## Background / current state

- `parseNotifications` (`src/github/notifications.ts`) currently **drops every subject
  that is not `PullRequest`**. Only PR notifications ever reach the user.
- `notifier.ts` holds a `REASON` lookup table mapping a handful of reasons to
  emoji/label, with a generic fallback. There is **no per-user filtering** — every
  linked user receives every PR notification.
- Commands are discord.js v14 slash commands (`/link`, `/unlink`, `/status`) wired
  through `discord/commands.ts` → `discord/client.ts` (interaction handler) →
  `discord/handlers.ts`.
- State is SQLite (`better-sqlite3`) in `db.ts`; the `users` table has no
  subscription columns yet.
- Scheduling is a single 60s `setInterval` poller (`poller.ts`) — there is **no cron
  infrastructure**.
- `github/search.ts` (`searchPullRequests`) and `status.ts` (`formatAttention`)
  already implement "PRs awaiting your review" and "your PRs pending review" — the
  digest reuses these.

## Decisions (locked)

- **Filter axis:** both — subject type **and** reason.
- **Command UX:** interactive Discord multi-select menus (not args, not subcommands).
- **Default subscription:** PRs only (current behavior). Everything else is opt-in.
  Existing linked users keep exactly today's behavior.
- **Digest content:** current-state snapshot (stateless), not a 24h activity diff.
- **Digest control:** a separate `/digest` command (default ON).
- **Filtering semantics:** a notification is delivered iff its subject type is enabled
  **AND** its reason is enabled.
- **Digest time:** globally 06:00 BRT for all users; `/digest` only toggles on/off
  (no per-user scheduling).

## Architecture

### Section 1 — Notification taxonomy (`src/github/taxonomy.ts`, new)

Single source of truth for both axes. Each entry is `{ key, label, emoji }`.

- **Subject types:** `PullRequest`, `Issue`, `Discussion`, `Release`, `Commit`,
  `CheckSuite` (CI), `RepositoryVulnerabilityAlert` (security).
- **Reasons:** `review_requested`, `mention`, `team_mention`, `comment`, `assign`,
  `author`, `state_change`, `ci_activity`, `subscribed`, `manual`, `invitation`,
  `security_alert`, `your_activity`, `push`.

Unknown subject types / reasons coming from the API still parse and format via a
graceful fallback (generic emoji/label) — we never drop or crash on an unrecognized
value.

This module replaces the inline `REASON` table in `notifier.ts`, and feeds the
`/listen-to` menus.

### Section 2 — Data model (`src/db.ts`)

Add three nullable columns to `users` via an **idempotent** migration (guard each
`ALTER TABLE ADD COLUMN` so re-running against an already-migrated DB is a no-op):

| Column                | Type      | NULL meaning (default)        |
| --------------------- | --------- | ----------------------------- |
| `subscribed_subjects` | `TEXT`    | JSON array; NULL = `["PullRequest"]` |
| `subscribed_reasons`  | `TEXT`    | JSON array; NULL = **all** reasons |
| `digest_enabled`      | `INTEGER` | `0/1`; NULL/absent = `1` (on) |

New `Database` methods:

- `getSubscriptions(discordId): { subjects: Set<string>; reasons: Set<string> | null }`
  — `subjects` always resolves to a concrete set (NULL → `{"PullRequest"}`).
  `reasons` resolves to `null` when the column is NULL (meaning **pass-all reasons**,
  including unknown ones) and to a concrete set once the user has customized it.
- `setSubscriptions(discordId, subjects: string[], reasons: string[]): void`
- `setDigestEnabled(discordId, enabled: boolean): void`
- `getDigestEnabled(discordId): boolean`

The asymmetry is deliberate and preserves today's behavior exactly: a brand-new /
existing user gets PR subjects only, but **every** reason (known or not) passes —
matching the current fallback path. Once a user customizes reasons via `/listen-to`,
the menu can only offer known taxonomy reasons, so the resolved set is concrete and
unknown reasons are then suppressed (acceptable, since it's an explicit choice).
Because NULL resolves to today's behavior, **existing linked users are unaffected**
until they explicitly use `/listen-to` or `/digest`.

A small `meta` key/value table (`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)`)
is added to persist `last_digest_date` (see Section 6). Methods: `getMeta(key)`,
`setMeta(key, value)`.

### Section 3 — Parsing expansion (`src/github/notifications.ts`)

- `parseNotifications` stops filtering on `subject.type === "PullRequest"` — it keeps
  all subjects.
- `NotificationItem` generalizes:
  - `prNumber` → `subjectNumber: number | null`
  - `prTitle`  → `subjectTitle: string`
  - `prUrl`    → `subjectUrl: string`
  - add `subjectType: string`
  - keep `threadId`, `reason`, `updatedAt`, `repoFullName`.
- URL → html conversion is **best-effort per type**: PR (`/pull/N`) and Issue
  (`/issues/N`) map cleanly from the API URL; Release/Commit/Discussion fall back to
  the subject's html URL when derivable, else the repo URL, when no clean number
  exists. `subjectNumber` is `null` for subjects without a number (e.g. Release,
  Commit, Discussion where unavailable).

### Section 4 — Filtering & formatting (`src/poller.ts`, `src/notifier.ts`)

- In `pollUser`, after fetching, load `deps.db.getSubscriptions(user.discordId)` and
  deliver an item only if `subjects.has(item.subjectType)` **and**
  (`reasons === null || reasons.has(item.reason)`) — i.e. a NULL reasons column passes
  every reason (preserving today's fallback behavior), while a customized set gates on
  membership. Subscriptions are read once per poll tick per user.
- `formatNotification(item, verdict?)` uses the subject-type emoji + reason label from
  the taxonomy (replacing the old `REASON`/`FALLBACK` constants). Output keeps the
  current two-line shape (header line with emoji/label/repo/relative-time, then a
  masked link to the subject).
- **Verdict enrichment stays PR-only:** the `fetchLatestReview` lookup in `pollUser`
  is guarded by `item.subjectType === "PullRequest"` and `item.subjectNumber != null`.
  All existing verdict behavior is preserved for PRs; other subject types never invoke it.

### Section 5 — `/listen-to` command (interactive)

- Register `/listen-to` in `discord/commands.ts` (no options).
- On invocation: reply **ephemerally** with two Discord string select menus
  (`min_values: 0`, `max_values: <count>`):
  - **Subject types** — all taxonomy subject types, options pre-marked `default: true`
    for the user's currently-enabled set.
  - **Reasons** — all taxonomy reasons, pre-marked from the user's set.
  - A **Save** button.
- Discord caps a string select at 25 options; both lists are well under 25.
- Extend `discord/client.ts`'s interaction handler to also handle
  `interaction.isStringSelectMenu()` and `interaction.isButton()`, dispatched by
  `customId` (e.g. `listen-to:subjects`, `listen-to:reasons`, `listen-to:save`).
- Selection state is held transiently keyed by the message/user (the select-menu
  interactions update an in-memory pending map; Save commits to the DB via
  `setSubscriptions`). On Save, update the ephemeral message to a confirmation.
- New handler(s) in `discord/handlers.ts` (`handleListenTo`, plus the component
  callbacks). Follows the existing `CommandContext` injection pattern so the logic is
  unit-testable without a live Discord connection.

### Section 6 — Daily digest (`src/digest.ts`, `src/scheduler.ts`, `/digest`)

**`digest.ts`**
- `buildDigest(deps, user): string | null` — reuses `searchPullRequests` to gather
  (a) PRs awaiting the user's review and (b) the user's open authored PRs, and formats
  them with a formatter extending `status.ts`'s `formatAttention`. Returns `null` when
  there is nothing to report (so we never DM an empty digest).
- `sendDigests(deps, now)` — iterates `db.getAllUsers()`, skips users with
  `digest_enabled = 0`, builds each digest, and DMs non-null results. Per-user errors
  are caught and logged (one failure never blocks the rest), mirroring the poller.

**`scheduler.ts`**
- `startDigestScheduler(deps, clock = Date.now)` — a coarse interval (every 60s) that:
  1. Computes the current **date and hour in `America/São_Paulo`** via
     `Intl.DateTimeFormat` with `timeZone: "America/Sao_Paulo"` (BRT = UTC−3, Brazil
     has no DST since 2019).
  2. Reads `db.getMeta("last_digest_date")`.
  3. If the BRT hour is ≥ 6 **and** today's BRT date ≠ the stored date, calls
     `sendDigests`, then writes today's BRT date to `last_digest_date`.
- This makes the job **idempotent across restarts** — a crash/redeploy at 06:30 won't
  re-send because the date is already recorded. The clock is injected for testing.
- Wired in `index.ts` next to `startPoller`, returns a `{ stop() }` handle.

**`/digest` command**
- Register `/digest` in `discord/commands.ts`.
- Ephemeral reply showing current state (**ON/OFF** from `getDigestEnabled`) with a
  toggle button and a **Preview now** button (the latter builds and DMs the digest
  immediately for a sanity check). Component interactions routed by `customId`
  (`digest:toggle`, `digest:preview`) through the same extended handler in `client.ts`.

### Section 7 — Testing (Vitest)

Following the existing DI/fake patterns (`FetchLike`, fake `Database`, fake `DmSender`,
fake `CommandContext`):

- **taxonomy** — default sets resolve correctly; unknown key fallback.
- **db** — migration is idempotent; `getSubscriptions` NULL→defaults; round-trip
  `setSubscriptions`/`setDigestEnabled`; `meta` get/set.
- **notifications parsing** — each subject type parses; `subjectNumber` null cases;
  URL best-effort conversion.
- **poller filtering** — matrix of (subject enabled/disabled × reason enabled/disabled)
  → delivered/suppressed; verdict lookup invoked only for PRs.
- **digest** — `buildDigest` formatting; `null` on empty; `sendDigests` skips disabled
  users and isolates per-user errors.
- **scheduler** — fires at/after 06:00 BRT, exactly once per BRT day, does not re-fire
  after a simulated restart (meta date persisted), does not fire before 06:00.
- **handlers** — `/listen-to` renders pre-checked menus and commits on Save;
  `/digest` toggles state and previews.

## Out of scope (YAGNI)

- Per-user digest time / timezone.
- 24h activity-diff digest (we ship the stateless snapshot).
- Filtering by repository or per-repo subscriptions.
- Backfilling notifications the user missed while unsubscribed.
