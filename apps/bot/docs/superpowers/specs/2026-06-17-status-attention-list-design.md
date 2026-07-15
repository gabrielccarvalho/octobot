# `/status` Attention List — Design

**Date:** 2026-06-17
**Status:** Approved
**Builds on:** `2026-06-17-oauth-notification-poller-design.md`

## Overview

Extend the `/status` slash command so that, for a connected user, it also lists
the pull requests needing attention right now, in two sections:

1. **Awaiting your review** — all open PRs where your review is requested.
2. **Your PRs awaiting review** — your open, non-draft PRs that still need a
   review (not yet approved).

There is **no time window** — both sections are full current snapshots.

Data comes from the GitHub **Search API**, called on demand with the caller's
stored OAuth token. Because `/status` now makes live network calls, it defers
its (ephemeral) reply and then edits in the result.

## Goals

- One command to see "what's on my plate" without leaving Discord.
- Accurate, current snapshots (no stale time-bounded list).
- Graceful, never-crashing behavior on API/token errors.

## Non-Goals (v1)

- Pagination beyond the first results page (cap at the first 30 results,
  display up to 10 per section).
- Caching results between invocations.
- Configurable section sizes or filters.

## Search Queries

Issued via `GET /search/issues` with `sort=updated&order=desc&per_page=30`. The
two query strings are static (no time window), so they're defined as exported
constants and asserted directly in tests:

| Section | Exported constant | Query |
| --- | --- | --- |
| Awaiting your review | `QUERY_AWAITING_MY_REVIEW` | `is:open is:pr review-requested:@me` |
| Your PRs awaiting review | `QUERY_MY_PRS_AWAITING_REVIEW` | `is:open is:pr author:@me draft:false review:required` |

> Note on `review:required`: GitHub's filter matches PRs that still need a
> review to satisfy review requirements (i.e. not yet approved). This is the
> pragmatic "waiting for someone's review" set; already-approved PRs drop off.
> (Edge case: in repos with no review requirement configured, GitHub may not
> surface a PR as `review:required`; acceptable for v1.)

`@me` resolves server-side to the token's owner, so no username interpolation is
needed.

## Architecture

A new GitHub client module plus a status-assembly seam injected into the
existing handler. No changes to the poller or storage.

```
src/
  github/
    search.ts        searchPullRequests(token, query, fetchImpl?) -> PrSummary[]   (NEW)
  discord/
    handlers.ts      handleStatus(ctx, db, deps) gains an attention list           (CHANGED)
    client.ts        /status defers the ephemeral reply, then edits                (CHANGED)
  index.ts           wires the status deps (decrypt + search + query building)      (CHANGED)
```

### `github/search.ts`

```ts
export interface PrSummary {
  repoFullName: string;  // owner/repo, from item.repository_url
  number: number;        // item.number
  title: string;         // item.title
  url: string;           // item.html_url
  updatedAt: string;     // item.updated_at
}

export async function searchPullRequests(
  token: string,
  query: string,
  fetchImpl?: FetchLike
): Promise<PrSummary[]>;
```

- GETs `https://api.github.com/search/issues?q=<query>&sort=updated&order=desc&per_page=30`
  with Bearer auth.
- On non-2xx, throws an error carrying the status (so the handler can special-case 401).
- Parses `items[]`, deriving `repoFullName` from `repository_url`
  (`https://api.github.com/repos/{owner}/{repo}` → `{owner}/{repo}`) and `url`
  from `html_url`.

### Status assembly (injected dependency)

The handler receives a `StatusDeps` it can call with the connected user:

```ts
export interface AttentionList {
  incoming: PrSummary[];   // awaiting your review
  mine: PrSummary[];       // your PRs awaiting review
}
export interface StatusDeps {
  listAttention(user: User): Promise<AttentionList>;
}
```

`listAttention` (wired in `index.ts`) decrypts the user's token and runs the two
searches. This keeps `handleStatus` free of crypto/HTTP and fully unit-testable
with a fake `listAttention`.

## `handleStatus` behavior

1. `user = db.getUser(ctx.userId)`.
2. **Not connected** → reply the existing guidance: "You're not connected. Run
   `/link`…". (No API calls.)
3. **Connected** → call `deps.listAttention(user)` and reply with:
   - Header: `✅ Connected as \`<login>\``
   - **🔍 Awaiting your review (N)** — up to 10 lines; each
     `• [owner/repo #<num> <title>](<url>)` with `<title>` truncated to ~70
     chars. If more than 10, append `…and <K> more`. Empty → `Nothing awaiting
     your review. 🎉`
   - **📝 Your PRs awaiting review (N)** — same formatting/cap. Empty → `No open
     PRs of yours are waiting on a review.`
   - On `listAttention` failure:
     - token rejected (401) → `Your GitHub connection expired — run \`/link\` to
       reconnect.`
     - anything else → `Couldn't reach GitHub right now — try again in a moment.`
   - The header is always shown even on error.

Masked links suppress Discord's link embeds (consistent with the DM format). The
10-per-section cap plus title truncation keeps the message comfortably under
Discord's 2000-character limit.

## Discord adapter change

The interaction adapter defers `/status` before dispatching:

- For `status`: `await interaction.deferReply({ flags: MessageFlags.Ephemeral })`,
  then `ctx.reply` maps to `interaction.editReply({ content })`.
- For `link`/`unlink`: unchanged (immediate `interaction.reply`).

`ctx.reply` is made defer-aware: if the interaction is already deferred/replied
it edits; otherwise it replies. Deferring avoids the 3-second interaction
timeout while the GitHub searches run.

## Error handling

- `searchPullRequests` throws with the HTTP status on non-2xx; `listAttention`
  propagates it; `handleStatus` maps 401 → reconnect message, else → generic
  retry message. The handler never throws.
- A revoked token here does **not** delete the user row (that remains the
  poller's responsibility on its 401 path); `/status` just tells them to relink.

## Testing

- **`searchPullRequests`** (fake fetch): parses items (repo/url/number/title
  derivation), returns `[]` on empty results, throws with status on non-2xx.
- **`handleStatus`** (fake `StatusDeps` + in-memory db):
  - not connected → guidance message, `listAttention` not called.
  - connected with items in both sections → header + both sections, masked-link
    lines present.
  - empty sections → the friendly empty-state lines.
  - more than 10 in a section → "…and N more" and only 10 rendered.
  - `listAttention` rejects with a 401-flagged error → reconnect message; rejects
    otherwise → generic retry message.
- **Queries:** assert the two exported constants `QUERY_AWAITING_MY_REVIEW` and
  `QUERY_MY_PRS_AWAITING_REVIEW` equal the specified strings (no time window).

## Out of Scope (v1)

Pagination, caching, configurable windows/sizes, and showing review state badges
(approved/changes-requested) per PR.
