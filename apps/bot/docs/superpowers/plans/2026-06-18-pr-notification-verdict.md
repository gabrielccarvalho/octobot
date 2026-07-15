# PR Notification Verdict Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the real verdict (approved / changes requested / reviewed) on PR review notifications instead of the generic "Activity on your PR".

**Architecture:** Fetch the PR's reviews via one extra GitHub API call per notification, match the latest submitted review against the notification's timestamp, and let a resolved verdict override the generic reason-based label. Any lookup failure falls back to today's behavior.

**Tech Stack:** TypeScript, Node, Vitest. GitHub REST API via the injected `FetchLike` abstraction (`src/github/http.ts`).

## Global Constraints

- Tests use Vitest with a `fakeFetch(status, body, headers)` helper of type `FetchLike` (see `src/github/notifications.test.ts`).
- GitHub helpers never throw on non-200 — they return a null/empty sentinel (see `fetchNotifications`).
- A richer notification must NEVER drop a notification: enrichment failures fall back silently.
- Run all tests with: `npx vitest run`
- Build with: `npx tsc`
- Commit messages: plain, no co-author/attribution trailers.

---

### Task 1: `fetchLatestReview` GitHub helper

**Files:**
- Create: `src/github/reviews.ts`
- Test: `src/github/reviews.test.ts`

**Interfaces:**
- Consumes: `FetchLike`, `defaultFetch` from `./http`.
- Produces:
  - `type ReviewState = "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED"`
  - `interface LatestReview { state: ReviewState; submittedAt: string }`
  - `fetchLatestReview(token: string, repoFullName: string, prNumber: number, fetchImpl?: FetchLike): Promise<LatestReview | null>`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { fetchLatestReview } from "./reviews";
import type { FetchLike } from "./http";

function fakeFetch(status: number, body: unknown): FetchLike {
  return async () => ({
    status,
    ok: status < 400,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

const review = (state: string, submitted_at: string | null) => ({ state, submitted_at });

describe("fetchLatestReview", () => {
  it("returns the most recently submitted review", async () => {
    const f = fakeFetch(200, [
      review("APPROVED", "2026-06-17T10:00:00Z"),
      review("CHANGES_REQUESTED", "2026-06-18T09:00:00Z"),
      review("COMMENTED", "2026-06-17T12:00:00Z"),
    ]);
    const res = await fetchLatestReview("tok", "acme/repo", 42, f);
    expect(res).toEqual({ state: "CHANGES_REQUESTED", submittedAt: "2026-06-18T09:00:00Z" });
  });

  it("ignores pending reviews with a null submitted_at", async () => {
    const f = fakeFetch(200, [review("APPROVED", "2026-06-17T10:00:00Z"), review("PENDING", null)]);
    const res = await fetchLatestReview("tok", "acme/repo", 42, f);
    expect(res).toEqual({ state: "APPROVED", submittedAt: "2026-06-17T10:00:00Z" });
  });

  it("returns null when there are no reviews", async () => {
    expect(await fetchLatestReview("tok", "acme/repo", 42, fakeFetch(200, []))).toBeNull();
  });

  it("returns null on a non-200 response", async () => {
    expect(await fetchLatestReview("tok", "acme/repo", 42, fakeFetch(403, null))).toBeNull();
  });

  it("calls the pulls reviews endpoint with a bearer token", async () => {
    let calledUrl = "";
    let auth: string | undefined;
    const f: FetchLike = async (url, init) => {
      calledUrl = url;
      auth = init?.headers?.authorization;
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => [], text: async () => "[]" };
    };
    await fetchLatestReview("tok", "acme/repo", 42, f);
    expect(calledUrl).toBe("https://api.github.com/repos/acme/repo/pulls/42/reviews");
    expect(auth).toBe("Bearer tok");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/github/reviews.test.ts`
Expected: FAIL — cannot find module `./reviews` / `fetchLatestReview` is not defined.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { type FetchLike, defaultFetch } from "./http";

export type ReviewState = "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED";

export interface LatestReview {
  state: ReviewState;
  submittedAt: string;
}

interface RawReview {
  state: string;
  submitted_at: string | null;
}

export async function fetchLatestReview(
  token: string,
  repoFullName: string,
  prNumber: number,
  fetchImpl: FetchLike = defaultFetch
): Promise<LatestReview | null> {
  const res = await fetchImpl(
    `https://api.github.com/repos/${repoFullName}/pulls/${prNumber}/reviews`,
    { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" } }
  );
  if (res.status !== 200) return null;

  const reviews = (await res.json()) as RawReview[];
  let latest: RawReview | null = null;
  for (const r of reviews) {
    if (!r.submitted_at) continue; // pending review, not yet submitted
    if (!latest || r.submitted_at > latest.submitted_at!) latest = r;
  }
  if (!latest) return null;

  return { state: latest.state as ReviewState, submittedAt: latest.submitted_at! };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/github/reviews.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/github/reviews.ts src/github/reviews.test.ts
git commit -m "feat: add fetchLatestReview GitHub helper"
```

---

### Task 2: `resolveVerdict` pure helper

**Files:**
- Modify: `src/notifier.ts`
- Test: `src/notifier.test.ts`

**Interfaces:**
- Consumes: `NotificationItem` from `./github/notifications`; `LatestReview` from `./github/reviews`.
- Produces:
  - `type Verdict = "approved" | "changes_requested" | "reviewed"`
  - `resolveVerdict(item: NotificationItem, latestReview: LatestReview | null): Verdict | null`

- [ ] **Step 1: Write the failing test**

Add to `src/notifier.test.ts` (and update the import line at the top to
`import { formatNotification, resolveVerdict } from "./notifier";`):

```typescript
import type { LatestReview } from "./github/reviews";

describe("resolveVerdict", () => {
  // item.updatedAt is "2026-06-17T10:00:00Z" (defined at top of file)
  const at = (state: LatestReview["state"], submittedAt: string): LatestReview => ({ state, submittedAt });

  it("returns null when there is no review", () => {
    expect(resolveVerdict(item, null)).toBeNull();
  });

  it("maps an approval submitted at the notification time", () => {
    expect(resolveVerdict(item, at("APPROVED", "2026-06-17T10:00:00Z"))).toBe("approved");
  });

  it("maps changes requested", () => {
    expect(resolveVerdict(item, at("CHANGES_REQUESTED", "2026-06-17T10:00:05Z"))).toBe("changes_requested");
  });

  it("maps a commented review to reviewed", () => {
    expect(resolveVerdict(item, at("COMMENTED", "2026-06-17T10:00:00Z"))).toBe("reviewed");
  });

  it("returns null for a dismissed review", () => {
    expect(resolveVerdict(item, at("DISMISSED", "2026-06-17T10:00:00Z"))).toBeNull();
  });

  it("ignores a stale review outside the timestamp tolerance", () => {
    // approval happened 5 minutes before this notification's updatedAt -> not the trigger
    expect(resolveVerdict(item, at("APPROVED", "2026-06-17T09:55:00Z"))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/notifier.test.ts`
Expected: FAIL — `resolveVerdict` is not exported / not a function.

- [ ] **Step 3: Write minimal implementation**

Add to `src/notifier.ts` (import `LatestReview` at the top):

```typescript
import type { LatestReview } from "./github/reviews";

export type Verdict = "approved" | "changes_requested" | "reviewed";

const VERDICT_BY_STATE: Record<string, Verdict> = {
  APPROVED: "approved",
  CHANGES_REQUESTED: "changes_requested",
  COMMENTED: "reviewed",
};

const VERDICT_TOLERANCE_MS = 10_000;

export function resolveVerdict(item: NotificationItem, latestReview: LatestReview | null): Verdict | null {
  if (!latestReview) return null;
  const verdict = VERDICT_BY_STATE[latestReview.state];
  if (!verdict) return null; // DISMISSED or unknown
  // Only trust the review if it was submitted ~when this notification fired; otherwise
  // it's an old review on a PR that just got an unrelated event (e.g. a new comment).
  const drift = Math.abs(Date.parse(latestReview.submittedAt) - Date.parse(item.updatedAt));
  if (drift > VERDICT_TOLERANCE_MS) return null;
  return verdict;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/notifier.test.ts`
Expected: PASS (existing formatNotification tests + 6 new resolveVerdict tests).

- [ ] **Step 5: Commit**

```bash
git add src/notifier.ts src/notifier.test.ts
git commit -m "feat: add resolveVerdict to map a review state to a notification verdict"
```

---

### Task 3: `formatNotification` honors the verdict

**Files:**
- Modify: `src/notifier.ts`
- Test: `src/notifier.test.ts`

**Interfaces:**
- Consumes: `Verdict` (from Task 2), `NotificationItem`.
- Produces: `formatNotification(item: NotificationItem, verdict?: Verdict | null): string` (the `verdict` parameter is new and optional).

- [ ] **Step 1: Write the failing test**

Add to the `describe("formatNotification", ...)` block in `src/notifier.test.ts`:

```typescript
  it("renders the approved verdict, overriding the reason label", () => {
    const first = formatNotification(item, "approved").split("\n")[0];
    expect(first).toContain("✅");
    expect(first).toContain("**Your PR was approved**");
  });

  it("renders the changes-requested verdict", () => {
    const first = formatNotification(item, "changes_requested").split("\n")[0];
    expect(first).toContain("🔧");
    expect(first).toContain("**Changes requested on your PR**");
  });

  it("renders the reviewed verdict", () => {
    const first = formatNotification(item, "reviewed").split("\n")[0];
    expect(first).toContain("💬");
    expect(first).toContain("**New review on your PR**");
  });

  it("ignores a null verdict and uses the reason label", () => {
    expect(formatNotification(item, null)).toContain("**Review requested**");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/notifier.test.ts`
Expected: FAIL — verdict output not present (the generic label is rendered instead).

- [ ] **Step 3: Write minimal implementation**

In `src/notifier.ts`, add the verdict map and update `formatNotification`:

```typescript
const VERDICT_LABEL: Record<Verdict, { emoji: string; label: string }> = {
  approved: { emoji: "✅", label: "Your PR was approved" },
  changes_requested: { emoji: "🔧", label: "Changes requested on your PR" },
  reviewed: { emoji: "💬", label: "New review on your PR" },
};

export function formatNotification(item: NotificationItem, verdict?: Verdict | null): string {
  const { emoji, label } = verdict ? VERDICT_LABEL[verdict] : (REASON[item.reason] ?? FALLBACK);
  // Discord renders <t:UNIX:R> as a localized, auto-updating "5 minutes ago".
  const unix = Math.floor(new Date(item.updatedAt).getTime() / 1000);
  // Masked link keeps it clickable while suppressing Discord's bulky link embed.
  return [
    `${emoji} **${label}** · ${item.repoFullName} · <t:${unix}:R>`,
    `[#${item.prNumber} ${item.prTitle}](${item.prUrl})`,
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/notifier.test.ts`
Expected: PASS (all formatNotification + resolveVerdict tests).

- [ ] **Step 5: Commit**

```bash
git add src/notifier.ts src/notifier.test.ts
git commit -m "feat: render the review verdict in PR notifications"
```

---

### Task 4: Wire the verdict lookup into the poller

**Files:**
- Modify: `src/poller.ts`
- Modify: `src/index.ts:77-86` (construct the poller with the real `fetchLatestReview`)
- Test: `src/poller.test.ts`

**Interfaces:**
- Consumes: `fetchLatestReview`, `LatestReview` from `./github/reviews`; `resolveVerdict`, `formatNotification` from `./notifier`.
- Produces: `PollerDeps` gains a `fetchLatestReview(token: string, repoFullName: string, prNumber: number): Promise<LatestReview | null>` field.

- [ ] **Step 1: Write the failing tests**

In `src/poller.test.ts`, add `fetchLatestReview` to the imports and the `deps()`
factory, then add new tests. Update the top import to include the type:

```typescript
import type { LatestReview } from "./github/reviews";
```

Add a mutable fake alongside `nextResult` and reset it in `beforeEach`:

```typescript
let nextReview: LatestReview | null;
// in beforeEach:  nextReview = null;
```

Update the `deps()` factory to inject it:

```typescript
function deps(): PollerDeps {
  return {
    db,
    sender,
    decryptToken: () => "tok",
    fetchNotifications: async () => nextResult,
    fetchLatestReview: async () => nextReview,
  };
}
```

Add the tests:

```typescript
it("renders the fetched verdict in the DM", async () => {
  nextResult = { status: 200, items: [prItem], lastModified: "Mon", pollInterval: 60 };
  nextReview = { state: "APPROVED", submittedAt: prItem.updatedAt };
  await pollUser(deps(), user());
  expect(sent[0].message).toContain("Your PR was approved");
});

it("falls back to the generic label when the review lookup throws", async () => {
  nextResult = { status: 200, items: [prItem], lastModified: "Mon", pollInterval: 60 };
  const d = deps();
  d.fetchLatestReview = async () => { throw new Error("boom"); };
  await pollUser(d, user());
  expect(sent).toHaveLength(1);
  expect(sent[0].message).toContain("Review requested"); // prItem.reason fallback, DM not dropped
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/poller.test.ts`
Expected: FAIL — `fetchLatestReview` missing from `PollerDeps` (type error) and the verdict text is absent.

- [ ] **Step 3: Implement the poller wiring**

In `src/poller.ts`, add imports and extend `PollerDeps`:

```typescript
import { resolveVerdict, formatNotification, type DmSender } from "./notifier";
import type { LatestReview } from "./github/reviews";
```

Add to the `PollerDeps` interface:

```typescript
  fetchLatestReview(token: string, repoFullName: string, prNumber: number): Promise<LatestReview | null>;
```

Replace the send block inside the `for (const item of res.items)` loop:

```typescript
    if (deps.db.wasNotified(user.discordId, item.threadId, item.updatedAt)) continue;
    let verdict = null;
    try {
      const review = await deps.fetchLatestReview(token, item.repoFullName, item.prNumber);
      verdict = resolveVerdict(item, review);
    } catch (err) {
      // Enrichment is best-effort; never let it drop the notification.
      console.warn(`Verdict lookup failed for ${user.discordId} thread ${item.threadId}:`, err);
    }
    try {
      await deps.sender.sendDm(user.discordId, formatNotification(item, verdict));
      deps.db.markNotified(user.discordId, item.threadId, item.updatedAt);
    } catch (err) {
      console.warn(`Failed to DM ${user.discordId} for thread ${item.threadId}:`, err);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/poller.test.ts`
Expected: PASS (existing poller tests + 2 new ones).

- [ ] **Step 5: Wire the real dependency in `index.ts`**

In `src/index.ts`, add the import near the other github imports (line ~9):

```typescript
import { fetchLatestReview } from "./github/reviews";
```

Add the field to the `startPoller({ ... })` call (after the `fetchNotifications` line, ~85):

```typescript
    fetchLatestReview: (token, repoFullName, prNumber) =>
      fetchLatestReview(token, repoFullName, prNumber),
```

- [ ] **Step 6: Build and run the full suite**

Run: `npx tsc && npx vitest run`
Expected: build succeeds with no type errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/poller.ts src/poller.test.ts src/index.ts
git commit -m "feat: fetch and render review verdict in PR notifications"
```

---

## Self-Review

- **Spec coverage:** `fetchLatestReview` (Task 1), `resolveVerdict` with 10s gate (Task 2), `formatNotification(item, verdict?)` with the three labels (Task 3), poller wiring + graceful fallback + real `index.ts` dep (Task 4). Out-of-scope items (merged-vs-closed, comment subtypes) intentionally untouched.
- **Type consistency:** `ReviewState`/`LatestReview` (reviews.ts) → `resolveVerdict` → `Verdict` → `VERDICT_LABEL` → `formatNotification` → `PollerDeps.fetchLatestReview`. Names match across tasks.
- **No placeholders:** every code/test step shows complete content and exact run commands.
