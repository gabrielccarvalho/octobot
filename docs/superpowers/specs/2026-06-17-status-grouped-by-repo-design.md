# `/status` Grouped-by-Repo Rendering — Design

**Date:** 2026-06-17
**Status:** Approved
**Builds on:** `2026-06-17-status-attention-list-design.md`

## Overview

Restyle the `/status` PR sections so PRs are **grouped by repository** under a
bold repo header, and each PR line shows a relative time. This is a presentation
change only — the data (two sections from the GitHub Search API) is unchanged.

## Target format

```
✅ Connected as octocat

🔍 Awaiting your review (3)
**acme/api**
#128 [Add rate limiting](…) · 5 minutes ago
#130 [Fix pagination](…) · 2 hours ago
**acme/web**
#54 [Fix nav overflow](…) · yesterday

📝 Your PRs awaiting review (1)
**acme/web**
#61 [Dark mode](…) · 3 days ago
```

### Per-PR line

`#<number> [<title>](<url>) · <relative time>`

- `#<number>` is plain text, outside the link.
- The **title is a masked link** (`[title](url)`) — no Discord embed — with the
  title truncated to **59 characters** (append `…` when truncated).
- `<relative time>` is Discord's native relative timestamp
  `<t:<unix>:R>`, computed from the PR's `updatedAt` (last activity). Discord
  renders it as a localized, auto-updating "5 minutes ago".

### Repo grouping

- `**owner/repo**` header line, then that repo's PR lines beneath it.
- Repos appear in the order their most-recently-updated PR appears (the Search
  API already returns results sorted by `updated` descending), and PRs keep that
  order within a repo. No extra sorting is introduced.

## Rules

- **10-per-section cap (unchanged), applied before grouping:** take the first 10
  PRs of the section, then group those into repos. If the section had more than
  10, append `…and <K> more` as the final line of the section.
- **Empty sections** keep their existing one-liners: "Nothing awaiting your
  review. 🎉" and "No open PRs of yours are waiting on a review."
- The section header still shows the total count: `🔍 Awaiting your review (N)`,
  `📝 Your PRs awaiting review (N)`, where `N` is the full section size.
- The existing 2000-character `clampMessage` backstop on the final reply stays.

## Architecture

A single change in `src/discord/handlers.ts`:

- A small `groupByRepo(prs)` helper that returns repos in first-seen order, each
  with its PRs (preserving order). Pure, no I/O.
- `renderSection(label, prs, emptyLine)` rewritten to: slice to the cap, group,
  and emit `**repo**` headers followed by per-PR lines, then the `…and K more`
  suffix when the pre-cap length exceeded the cap.
- A per-PR line helper builds `#<number> [<title≤59>](<url>) · <t:<unix>:R>`,
  reusing the existing `truncate` helper (limit changes from 70 to 59) and
  computing `unix = Math.floor(new Date(p.updatedAt).getTime() / 1000)`.

No changes to `github/search.ts` (the `PrSummary.updatedAt` field already
exists), the discord adapter, or `index.ts`. `handleStatus`'s signature,
not-connected path, and error handling are unchanged.

## Testing

Update `src/discord/handlers.test.ts` (the `/status` block):

- **Grouping:** two PRs in `acme/api` and one in `acme/web` render under exactly
  two `**acme/api**` / `**acme/web**` headers, with the two api PRs under the api
  header.
- **Per-PR line:** a line contains `#128`, the masked link
  `[<title>](<url>)`, and a `<t:<unix>:R>` token (unix derived from the fixture's
  `updatedAt`).
- **Title truncation:** a >59-char title is cut to 59 chars + `…`.
- **Cap before grouping:** 13 PRs → exactly 10 PR lines rendered and `…and 3
  more` present.
- **Empty sections:** unchanged friendly one-liners.
- **Errors / not-connected:** unchanged (401 → reconnect, other → retry,
  not-connected → guidance) — keep the existing assertions.

## Out of Scope

- Adding `created_at` or a "review requested at" timestamp (we use `updatedAt`).
- Per-repo caps, collapsing/expanding, or sorting beyond the API's `updated`
  order.
