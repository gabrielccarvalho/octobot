# Specific PR Notifications — Design

**Date:** 2026-07-14
**Status:** Approved (design), pending implementation plan

## Problem

Discord DMs for PR activity frequently render the generic **"✍️ Activity on your PR"**. This is the label for GitHub's notification `reason: "author"`, which GitHub uses as a catch-all for almost every event on a PR you authored (comment, review, push, merge, CI, …). The user wants every notification to name the specific event that occurred, and to never show the bare generic label again.

### Why the generic label happens

The bot polls the GitHub Notifications API (`GET /notifications`). Its `reason` field answers *"why are you subscribed to this thread"*, not *"what just happened"*. For authored PRs, `reason` collapses to `author`. The only current enrichment is a reviews call gated by a fragile 10-second tolerance (`VERDICT_TOLERANCE_MS`), so approve/changes-requested labels appear only when the review timestamp lands within 10s of the notification — otherwise it falls back to generic.

## Goal

For every PR notification, determine the actual triggering event and render a specific label. Coverage target ("everything detectable"):

- Review verdicts: approved, changes requested, review (commented)
- New comment (issue comment or review comment)
- New commits pushed / force-pushed
- Merged, closed, reopened
- Marked ready for review, converted to draft
- Assigned
- Labels changed
- Review requested, mentioned
- CI passed / CI failed

**Honest non-goal:** a literal 100% zero-generic guarantee is not achievable — GitHub can surface event types we have not mapped. The floor is a *descriptive* fallback derived from the notification `reason` (e.g. "🔔 Update on your PR"), never the bare "Activity on your PR".

## Approach

Chosen: **Approach 1 — Timeline API diffing** on top of the existing OAuth-token polling model. (Alternatives considered: cheap signal-probing — rejected, cannot detect push/assign/label; webhooks/GitHub App — the correct long-term architecture but a separate, much larger project. Noted as future migration, especially if the project scales past the polling ceiling.)

When a PR notification arrives, classify the triggering event from the PR's **timeline** (`GET /repos/{owner}/{repo}/issues/{n}/timeline`), which carries typed, timestamped events. CI is not in the timeline, so a separate **check-runs** probe covers CI, used only when the timeline yields nothing.

## Architecture & module boundaries

| Unit | File | Responsibility | Depends on |
|---|---|---|---|
| Timeline fetcher | `src/github/timeline.ts` *(new)* | `fetchPrEvent(token, repo, prNumber, at)` → the single most-significant `PrEvent` that caused the notification, or `null`. Fetch + parse of the timeline API. | `http.ts` |
| Checks probe | `src/github/checks.ts` *(new)* | `fetchChecksVerdict(token, repo, prNumber)` → `"passed" \| "failed" \| null`. | `http.ts` |
| Event classifier + labels | `src/notifier.ts` *(changed)* | Map a `PrEvent` / checks result → `{emoji, label}`; `formatNotification` keeps its shape but takes the resolved event instead of a `Verdict`. | timeline, checks types |
| Poller wiring | `src/poller.ts` *(changed)* | Swap the `fetchLatestReview`/`resolveVerdict` path for `fetchPrEvent` (+ `fetchChecksVerdict` fallback). | above |

**Retired:** `src/github/reviews.ts`, `resolveVerdict`, `VERDICT_BY_STATE`, `VERDICT_TOLERANCE_MS`, the `Verdict` type. Timeline `reviewed` events carry the review `state` directly, so the separate reviews call and its timestamp hack are redundant. (Retire `reviews.ts` only after confirming no other caller — e.g. digest — imports it; otherwise keep the file and drop only the verdict wiring.)

**Unchanged:** subscription filtering (`poller.ts:70-74`). We still decide *whether* to notify from the raw `reason`; the classifier only decides the *label*. No change to `/listen-to` semantics or the taxonomy of subscribable reasons.

## The event classifier

### Selection rule

The notification's `updatedAt` ≈ when the triggering event happened. The classifier picks **the latest timeline event whose timestamp is ≤ `updatedAt` + small skew tolerance**. That is the event that caused this notification — no dependence on stored previous state or DB history.

Skew tolerance: a few seconds (constant, e.g. `EVENT_SKEW_MS`), to absorb clock differences between GitHub's notification timestamp and the event timestamp.

### Data model

```ts
type PrEventKind =
  | "approved" | "changes_requested" | "reviewed"   // reviewed(state)
  | "commented"                                       // issue or review comment
  | "committed"                                       // pushed / force-pushed
  | "merged" | "closed" | "reopened"
  | "assigned" | "labeled" | "ready_for_review" | "converted_to_draft"
  | "review_requested" | "mentioned";

interface PrEvent { kind: PrEventKind; at: string; }
```

### GitHub timeline event → kind mapping

- `reviewed` → `approved` / `changes_requested` / `reviewed` based on the event's `state` (`APPROVED` / `CHANGES_REQUESTED` / `COMMENTED`; `DISMISSED` ignored).
- `commented`, `line-commented`, `review_comment` (issue/review comments) → `commented`.
- `committed`, `head_ref_force_pushed` → `committed`.
- `merged` → `merged`; `closed` → `closed`; `reopened` → `reopened`.
- `assigned` → `assigned`.
- `labeled`, `unlabeled` → `labeled`.
- `ready_for_review` → `ready_for_review`; `convert_to_draft` → `converted_to_draft`.
- `review_requested` → `review_requested`; `mentioned` → `mentioned`.
- Other event types (`renamed`, `milestoned`, `referenced`, …) → ignored (not selected).

### Priority

When multiple selectable events share the trigger timestamp, highest signal wins:

```
reviewed-verdict > merged > closed > reopened
> ready_for_review > converted_to_draft > committed
> commented > review_requested > assigned > labeled > mentioned
```

### Fallback chain

1. Timeline event found → map kind → label.
2. No timeline event at/near `updatedAt` (trigger outside the timeline — almost always CI) → `fetchChecksVerdict` → `CI passed` / `CI failed`.
3. Checks inconclusive / all enrichment failed → **descriptive** label from the notification `reason` (never the bare generic). Enrichment is best-effort; any thrown error lands here and the notification is still delivered.

## Data flow (poller)

Per **unseen** PR notification (the existing `wasNotified` dedup gate at `poller.ts:75` runs *before* enrichment, so repeats cost nothing):

```
PR notification (unseen thread)
    │
    ▼
fetchPrEvent(token, repo, n, at=updatedAt)     ← 1 call (timeline, last page)
    │
 ┌──┴───────────────┐
 ▼ event found      ▼ none
map kind → label   fetchChecksVerdict(...)      ← +2 calls (resolve head sha, then check-runs), only when timeline empty
                    │
                 ┌──┴────┐
                 ▼ yes   ▼ no
             CI label   reason-derived descriptive fallback
    │
    ▼
formatNotification(item, event) → sendDm → markNotified
```

### API-cost profile

- Common case: **1 extra call** per new PR notification — *net neutral* vs. today's single reviews call.
- Checks probe fires **only** when the timeline is empty (and, per the poller's `ci_activity` gating, only when GitHub flags the notification as CI) and costs **+2 calls** (resolve the PR's head sha, then read its check-runs), not +1.
- Worst case: 2 timeline pages (last-page jump) + 2 checks calls = 4 calls for a single notification.
- Non-PR notifications and already-seen threads: **zero** extra calls.

### Mitigations (polling bottleneck, ~120–250 users)

- Enrich only unseen PR threads (existing dedup gate).
- Timeline fetch requests the **last page only** via `Link: rel="last"`, `per_page=100`; worst case one extra page jump on very long PRs (hard cap: one jump).
- Best-effort enrichment (existing try/catch at `poller.ts:81`): failure → descriptive fallback, never a dropped notification.

## Label taxonomy

New `PR_EVENT_LABEL` table in `notifier.ts`:

| kind | emoji | label |
|---|---|---|
| approved | ✅ | Your PR was approved |
| changes_requested | 🔧 | Changes requested on your PR |
| reviewed | 💬 | New review on your PR |
| commented | 💬 | New comment on your PR |
| committed | 📌 | New commits on your PR |
| merged | 🎉 | Your PR was merged |
| closed | 🚪 | Your PR was closed |
| reopened | 🔓 | Your PR was reopened |
| ready_for_review | 📝 | Marked ready for review |
| converted_to_draft | 📄 | Converted to draft |
| assigned | 👤 | You were assigned |
| labeled | 🏷️ | Labels changed on your PR |
| review_requested | 🔔 | Review requested |
| mentioned | 📣 | Mentioned |
| checks: passed | ✅ | CI passed on your PR |
| checks: failed | ❌ | CI failed on your PR |
| fallback | 🔔 | Update on your PR |

The message shape in `formatNotification` is unchanged: `{emoji} **{label}** · {repoFullName} · <t:{unix}:R>` + masked PR link.

## Testing (TDD)

- `timeline.test.ts` — raw timeline fixtures → `fetchPrEvent` picks the right event by timestamp + priority: review verdict, comment, merge-vs-close, push/force-push, label, ready/draft, assigned, mentioned, and empty-timeline → `null`. Verify the ≤ `updatedAt`+skew selection rule (a newer unrelated event after the notification is *not* chosen).
- `checks.test.ts` — check-runs payloads → `passed` / `failed` / `null` (no runs, mixed, all success, one failure).
- `notifier.test.ts` — every `PrEventKind` → correct label; CI labels; reason-derived fallback.
- `poller.test.ts` — extend existing fake deps (replace `fetchLatestReview` with `fetchPrEvent` + `fetchChecksVerdict`): assert DM text per scenario; timeline-empty → checks path; enrichment throw → fallback, notification still sent; non-PR subject → no enrichment calls.

Follows the existing injected-dependency + fake-fetch patterns in these test files.

## Out of scope

- Daily digest formatting (separate path; only touch if it imports the retired verdict code).
- Webhook / GitHub App migration (future).
- New subscribable reasons or `/listen-to` changes.
- Issue/Discussion/Release event specificity (PR-only for now).
