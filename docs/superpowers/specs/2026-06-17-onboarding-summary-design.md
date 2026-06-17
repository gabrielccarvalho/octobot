# New-User Onboarding Summary — Design

**Date:** 2026-06-17
**Status:** Approved
**Builds on:** `2026-06-17-oauth-notification-poller-design.md`, `2026-06-17-status-attention-list-design.md`

## Problem

When a user first connects, the poller's first pass has no baseline
(`users.last_modified` is `NULL`), so `fetchNotifications` returns *all* current
unread PR notifications and the bot DMs every one — a flood of messages.

## Goal

On connect, send **one** `/status`-style summary DM, establish a baseline so the
flood never happens, and from then on notify only about genuinely new activity
(the existing per-event behavior).

## Behavior

The fix is triggered in the OAuth callback the moment a user finishes
authorizing, in two parts:

1. **Baseline (suppresses the flood).** Fetch the user's notifications once
   (`fetchNotifications(token, null)`); for each pull-request notification,
   record it as already-seen via `markNotified(discordId, threadId, updatedAt)`;
   store the response's `Last-Modified` as the user's `last_modified` watermark.
   No DMs are sent for these. The poller's subsequent `If-Modified-Since` polls
   then return only activity newer than the watermark, and the `markNotified`
   rows cover the same-second boundary.
2. **Summary (the single DM).** Run the same two GitHub Search-API queries
   `/status` uses (`QUERY_AWAITING_MY_REVIEW`, `QUERY_MY_PRS_AWAITING_REVIEW`),
   render them with the *same* formatter as `/status`, and send the result as one
   DM.

After onboarding, the poller updates the user normally — only new/updated PR
threads produce DMs.

**Re-linking** (`/link` again) resets `last_modified` to `NULL` via `upsertUser`,
so the next connect re-establishes a fresh baseline and re-sends the summary.

## Components & changes

### `src/status.ts` (new) — shared summary formatter
Extract the `/status` connected-summary rendering out of `handlers.ts` so both
`/status` and onboarding produce identical content (DRY):

```ts
export interface AttentionList { incoming: PrSummary[]; mine: PrSummary[]; }
export function formatAttention(githubLogin: string, list: AttentionList): string;
```

`formatAttention` returns the full connected message: the
`✅ Connected as \`<login>\`` header plus the two grouped-by-repo sections
(reusing the existing `groupByRepo` / `truncate` / `relativeTime` / per-section
rendering, 10-cap, "…and N more", empty-state lines, and the 2000-char clamp).
These render helpers move into `status.ts`.

### `src/discord/handlers.ts` — use the shared formatter
`handleStatus` keeps its signature, not-connected path, and error handling, but
its connected branch now calls `formatAttention(user.githubLogin, list)` instead
of building the sections inline. `AttentionList` and `StatusDeps` are imported
from `status.ts` (StatusDeps may stay in handlers; `AttentionList` moves to
`status.ts`).

### `src/http/routes.ts` — `onConnect` hook
`HttpDeps` gains:

```ts
onConnect(discordId: string, token: string, githubLogin: string): Promise<void>;
```

After a successful `upsertUser`, the callback `await`s `deps.onConnect(...)`
inside a `try/catch`; any onConnect error is logged but the "Connected" success
page is still returned (onboarding is best-effort, the link itself succeeded).
The plaintext `token` (already in hand from the code exchange) is passed in.

### `src/index.ts` — wire `onConnect`
Build the hook with the already-available `sender`, `db`, `fetchNotifications`,
`searchPullRequests` + the query constants, and `formatAttention`:

```
onConnect(discordId, token, login):
  // 1. baseline
  res = await fetchNotifications(token, null)
  if res.status === 200:
    for item of res.items: db.markNotified(discordId, item.threadId, item.updatedAt)
  watermark = (res.status === 200 && res.lastModified) ? res.lastModified : new Date().toUTCString()
  db.updateLastModified(discordId, watermark)
  // 2. summary
  [incoming, mine] = await Promise.all([
    searchPullRequests(token, QUERY_AWAITING_MY_REVIEW),
    searchPullRequests(token, QUERY_MY_PRS_AWAITING_REVIEW),
  ])
  await sender.sendDm(discordId, formatAttention(login, { incoming, mine }))
```

The watermark is always set (falling back to the current time as an HTTP-date if
the baseline fetch didn't yield a `Last-Modified`), so a user is never left
un-baselined.

### `src/poller.ts` — skip un-baselined users
`pollUser` returns early (does nothing) when `user.lastModified` is null. This
guarantees the poller never floods an un-baselined user and closes the race
between `upsertUser` (which nulls the watermark) and `onConnect` finishing the
baseline. Once `onConnect` sets the watermark, normal polling resumes.

## Data flow (connect)

```
/oauth/callback: exchangeCode → fetchViewerLogin → upsertUser (last_modified=NULL)
              → onConnect:
                   fetchNotifications(token, null) → markNotified each → updateLastModified(watermark)
                   search ×2 → formatAttention → sendDm  (the one summary)
poller (≥ next tick): sees last_modified set → If-Modified-Since → only new activity → normal DMs
```

## Error handling

- `onConnect` is wrapped in `try/catch` in the callback: failures are logged; the
  HTTP success page still renders.
- If the baseline fetch fails or returns no `Last-Modified`, the watermark falls
  back to `new Date().toUTCString()` so the user is still baselined (no flood,
  picks up new activity).
- A summary-DM failure is logged and swallowed (the link still succeeded).
- The poller's existing 401 handling (DM reconnect + delete user) is unchanged.

## Testing

- **`formatAttention`** (`status.test.ts`): the grouped/cap/empty/timestamp
  assertions move here from the handler tests; verify header + both sections.
- **`handleStatus`** (`handlers.test.ts`): still renders the connected summary
  (now via `formatAttention`), plus the unchanged not-connected/401/error paths.
- **`onConnect`** (wired in `index.ts`; tested as a unit by constructing the same
  closure logic, or by extracting it into a small tested helper): with fakes for
  `fetchNotifications`, `searchPullRequests`, and `sender`, and a real in-memory
  db — confirm it marks current threads seen, sets `last_modified`, and sends
  exactly one summary DM; and that on a baseline-fetch failure it still sets a
  watermark.
- **`poller`** (`poller.test.ts`): a user with `lastModified === null` is skipped
  (no fetch, no DM); existing "DMs new activity" tests set a watermark first.

> Implementation note for the plan: to make `onConnect` unit-testable rather than
> an untested inline closure in `index.ts`, extract its logic into a small
> `createOnConnect(deps)` factory (e.g. in `src/onboarding.ts`) that `index.ts`
> wires with real dependencies and the test exercises with fakes.

## Out of Scope

- A separate "onboarded" boolean column (the `last_modified` watermark doubles as
  the baseline signal).
- Backfilling existing already-linked users automatically — they re-run `/link`
  to get a clean baseline + summary.
