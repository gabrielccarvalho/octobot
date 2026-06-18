# PR notification verdict — design

**Date:** 2026-06-18

## Problem

PR notifications all collapse into generic labels. When someone approves your PR,
requests changes, or leaves a review, you currently see `✍️ Activity on your PR`
(for `reason: author`) with no indication of what actually happened.

GitHub's notifications list API only carries `reason` (why you were pinged:
`author`, `comment`, `review_requested`, `mention`, `state_change`), **not** the
review verdict. An approval and a "changes requested" both arrive as
`reason: author`. The verdict is simply not in the data we currently fetch.

## Goal

Surface the real verdict on review notifications:

| Verdict | Output |
|---|---|
| Approved | ✅ **Your PR was approved** |
| Changes requested | 🔧 **Changes requested on your PR** |
| Review (comment-only) | 💬 **New review on your PR** |

Everything else keeps today's behavior unchanged.

## Approach

To know the verdict we make **one extra GitHub API call per PR notification** to
fetch the PR's reviews and match the latest one against the notification.

### 1. `fetchLatestReview` — `src/github/reviews.ts` (new)

```
fetchLatestReview(token, repoFullName, prNumber, fetchImpl): Promise<LatestReview | null>
```

- `GET /repos/{owner}/{repo}/pulls/{prNumber}/reviews`
- Picks the most recent **submitted** review (max `submitted_at`; reviews with a
  null `submitted_at` are pending and excluded).
- Returns `{ state, submittedAt }` where `state ∈ APPROVED | CHANGES_REQUESTED |
  COMMENTED | DISMISSED`, or `null` when: no reviews, only pending reviews, or the
  response is non-200.
- Mirrors the existing `notifications.ts` shape: typed raw interface, `FetchLike`
  injection, no throwing on non-200 (returns `null`).

### 2. `resolveVerdict` — pure helper (in `notifier.ts`)

```
resolveVerdict(item: NotificationItem, latestReview: LatestReview | null): Verdict | null
```

- Returns `null` if `latestReview` is `null`.
- **Timestamp gate:** only trusts the review if `|submittedAt - item.updatedAt| <=
  10s`. This confirms *this* notification was triggered by *that* review, rather
  than an old approval lingering on a PR that just got a new comment.
- Maps state → verdict key: `APPROVED → approved`, `CHANGES_REQUESTED →
  changes_requested`, `COMMENTED → reviewed`. `DISMISSED` (and anything else) →
  `null` (graceful fallback).

### 3. `formatNotification(item, verdict?)` — `notifier.ts`

- New optional `verdict` parameter. When present, a verdict→`{emoji,label}` map
  takes precedence over the existing `reason` map:
  - `approved` → ✅ "Your PR was approved"
  - `changes_requested` → 🔧 "Changes requested on your PR"
  - `reviewed` → 💬 "New review on your PR"
- When `verdict` is absent/`null`, behavior is **exactly** as today.

### 4. Poller wiring — `src/poller.ts`

For each PR notification item:
1. Call `fetchLatestReview(token, item.repoFullName, item.prNumber)`.
2. `verdict = resolveVerdict(item, latestReview)`.
3. `sendDm(..., formatNotification(item, verdict))`.

The lookup is wrapped in try/catch — **any** failure (network, rate limit, parse)
→ `verdict = null` → falls back to the current label. A richer notification is
never allowed to drop a notification.

## Out of scope

- Distinguishing merged vs closed (`state_change`) — needs a separate PR-fetch
  call; "State changed" stays as-is.
- Inline review-comment vs issue-comment distinction — plain comments keep
  💬 "New comment".

## Testing

Test-first with a fake `FetchLike`, matching existing module conventions:
- `reviews.ts`: latest-of-many selection, pending excluded, non-200 → null, empty
  → null, URL construction.
- `resolveVerdict`: each state mapping, timestamp gate (in/out of tolerance),
  null review → null.
- `notifier`: verdict overrides reason; absent verdict preserves current output.
- `poller`: verdict passed through; lookup failure falls back without dropping the
  DM.
