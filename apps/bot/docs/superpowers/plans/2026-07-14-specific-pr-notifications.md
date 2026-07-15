# Specific PR Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic "✍️ Activity on your PR" DM with a label that names the actual event that triggered each PR notification.

**Architecture:** For each unseen PR notification the poller classifies the triggering event from the GitHub PR **timeline** API (`fetchPrEvent`), falling back to a **check-runs** probe (`fetchChecksVerdict`) when the trigger is CI (not in the timeline), and finally to a descriptive reason-derived label. The old reviews-call + 10s-tolerance verdict path is retired.

**Tech Stack:** TypeScript, Node, Vitest. GitHub REST API via the existing injected `FetchLike` abstraction (`src/github/http.ts`). No new dependencies.

## Global Constraints

- No new npm dependencies; use the existing `FetchLike` + `defaultFetch` pattern for all HTTP.
- Every GitHub request sends `authorization: "Bearer <token>"` and `accept: "application/vnd.github+json"`.
- Enrichment is **best-effort**: any thrown error or non-200 must fall back to a label and never drop the notification.
- A PR notification must **never** render the bare "Activity on your PR"; the floor is the descriptive `PR_FALLBACK` ("🔔 Update on your PR").
- Subscription filtering (whether to notify, based on raw `reason`) is unchanged.
- Run the full suite with `npm test` and typecheck with `npm run typecheck` (or `npx tsc --noEmit`) — both must pass before every commit.

---

### Task 1: PR timeline event fetcher + classifier

**Files:**
- Create: `src/github/timeline.ts`
- Test: `src/github/timeline.test.ts`

**Interfaces:**
- Consumes: `FetchLike`, `defaultFetch` from `./http`.
- Produces:
  - `type PrEventKind` (the 14 kinds below)
  - `interface PrEvent { kind: PrEventKind; at: string }`
  - `function selectPrEvent(raw: RawTimelineEvent[], at: string): PrEvent | null` (pure; exported for testing)
  - `async function fetchPrEvent(token: string, repoFullName: string, prNumber: number, at: string, fetchImpl?: FetchLike): Promise<PrEvent | null>`

- [ ] **Step 1: Write the failing test**

Create `src/github/timeline.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { selectPrEvent, fetchPrEvent } from "./timeline";
import type { FetchLike } from "./http";

// Timeline fixtures. `at` for the notification is 2026-06-17T10:00:00Z throughout.
const AT = "2026-06-17T10:00:00Z";
const ev = (event: string, ts: string, extra: Record<string, unknown> = {}) => ({
  event,
  created_at: ts,
  ...extra,
});

describe("selectPrEvent", () => {
  it("maps a reviewed(approved) event to approved", () => {
    const raw = [{ event: "reviewed", state: "approved", submitted_at: AT }];
    expect(selectPrEvent(raw, AT)).toEqual({ kind: "approved", at: AT });
  });

  it("maps reviewed states case-insensitively", () => {
    expect(selectPrEvent([{ event: "reviewed", state: "CHANGES_REQUESTED", submitted_at: AT }], AT))
      .toEqual({ kind: "changes_requested", at: AT });
    expect(selectPrEvent([{ event: "reviewed", state: "commented", submitted_at: AT }], AT)?.kind)
      .toBe("reviewed");
  });

  it("ignores a dismissed review", () => {
    expect(selectPrEvent([{ event: "reviewed", state: "dismissed", submitted_at: AT }], AT)).toBeNull();
  });

  it("maps a comment, merge, close, reopen, push, label, assign, ready, draft, review_requested, mention", () => {
    expect(selectPrEvent([ev("commented", AT)], AT)?.kind).toBe("commented");
    expect(selectPrEvent([ev("merged", AT)], AT)?.kind).toBe("merged");
    expect(selectPrEvent([ev("closed", AT)], AT)?.kind).toBe("closed");
    expect(selectPrEvent([ev("reopened", AT)], AT)?.kind).toBe("reopened");
    expect(selectPrEvent([{ event: "committed", committer: { date: AT } }], AT)?.kind).toBe("committed");
    expect(selectPrEvent([ev("head_ref_force_pushed", AT)], AT)?.kind).toBe("committed");
    expect(selectPrEvent([ev("labeled", AT)], AT)?.kind).toBe("labeled");
    expect(selectPrEvent([ev("assigned", AT)], AT)?.kind).toBe("assigned");
    expect(selectPrEvent([ev("ready_for_review", AT)], AT)?.kind).toBe("ready_for_review");
    expect(selectPrEvent([ev("convert_to_draft", AT)], AT)?.kind).toBe("converted_to_draft");
    expect(selectPrEvent([ev("review_requested", AT)], AT)?.kind).toBe("review_requested");
    expect(selectPrEvent([ev("mentioned", AT)], AT)?.kind).toBe("mentioned");
  });

  it("ignores unknown event types", () => {
    expect(selectPrEvent([ev("renamed", AT), ev("milestoned", AT)], AT)).toBeNull();
  });

  it("picks the latest event at or before the notification time", () => {
    const raw = [ev("labeled", "2026-06-17T09:00:00Z"), ev("commented", "2026-06-17T09:59:59Z")];
    expect(selectPrEvent(raw, AT)?.kind).toBe("commented");
  });

  it("ignores events after the notification time (+skew)", () => {
    // A comment 1 minute after the notification is a later, unrelated event.
    const raw = [ev("merged", AT), ev("commented", "2026-06-17T10:01:00Z")];
    expect(selectPrEvent(raw, AT)?.kind).toBe("merged");
  });

  it("breaks ties on the same timestamp by priority (reviewed > merged > commented)", () => {
    const raw = [ev("commented", AT), ev("merged", AT), { event: "reviewed", state: "approved", submitted_at: AT }];
    expect(selectPrEvent(raw, AT)?.kind).toBe("approved");
  });

  it("returns null for an empty timeline", () => {
    expect(selectPrEvent([], AT)).toBeNull();
  });
});

function fakeFetch(pages: { status: number; body: unknown; link?: string | null }[]): FetchLike {
  let i = 0;
  return async () => {
    const p = pages[Math.min(i++, pages.length - 1)];
    return {
      status: p.status,
      ok: p.status < 400,
      headers: { get: (n: string) => (n.toLowerCase() === "link" ? p.link ?? null : null) },
      json: async () => p.body,
      text: async () => JSON.stringify(p.body),
    };
  };
}

describe("fetchPrEvent", () => {
  it("classifies from a single-page timeline", async () => {
    const f = fakeFetch([{ status: 200, body: [{ event: "merged", created_at: AT }] }]);
    expect(await fetchPrEvent("tok", "acme/repo", 42, AT, f)).toEqual({ kind: "merged", at: AT });
  });

  it("follows the Link rel=last header to the final page", async () => {
    const f = fakeFetch([
      { status: 200, body: [{ event: "labeled", created_at: "2026-06-01T00:00:00Z" }],
        link: '<https://api.github.com/repositories/1/issues/42/timeline?per_page=100&page=3>; rel="last"' },
      { status: 200, body: [{ event: "merged", created_at: AT }] },
    ]);
    expect((await fetchPrEvent("tok", "acme/repo", 42, AT, f))?.kind).toBe("merged");
  });

  it("returns null on a non-200 timeline response", async () => {
    expect(await fetchPrEvent("tok", "acme/repo", 42, AT, fakeFetch([{ status: 404, body: null }]))).toBeNull();
  });

  it("requests the issues timeline endpoint with per_page=100 and a bearer token", async () => {
    let url = ""; let auth: string | undefined;
    const f: FetchLike = async (u, init) => {
      url = u; auth = init?.headers?.authorization;
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => [], text: async () => "[]" };
    };
    await fetchPrEvent("tok", "acme/repo", 42, AT, f);
    expect(url).toBe("https://api.github.com/repos/acme/repo/issues/42/timeline?per_page=100");
    expect(auth).toBe("Bearer tok");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/github/timeline.test.ts`
Expected: FAIL — `timeline.ts` does not exist / `selectPrEvent` not exported.

- [ ] **Step 3: Write the implementation**

Create `src/github/timeline.ts`:

```ts
import { type FetchLike, defaultFetch } from "./http";

export type PrEventKind =
  | "approved"
  | "changes_requested"
  | "reviewed"
  | "commented"
  | "committed"
  | "merged"
  | "closed"
  | "reopened"
  | "assigned"
  | "labeled"
  | "ready_for_review"
  | "converted_to_draft"
  | "review_requested"
  | "mentioned";

export interface PrEvent {
  kind: PrEventKind;
  at: string;
}

interface RawTimelineEvent {
  event?: string;
  state?: string;
  created_at?: string;
  submitted_at?: string;
  committer?: { date?: string };
  author?: { date?: string };
}

// Absorb clock drift between GitHub's notification timestamp and the event timestamp.
const SKEW_MS = 5_000;

// When several events share the trigger timestamp, the highest-signal one wins.
const PRIORITY: Record<PrEventKind, number> = {
  approved: 100,
  changes_requested: 100,
  reviewed: 100,
  merged: 90,
  closed: 80,
  reopened: 70,
  ready_for_review: 60,
  converted_to_draft: 55,
  committed: 50,
  commented: 40,
  review_requested: 30,
  assigned: 20,
  labeled: 10,
  mentioned: 5,
};

function eventTime(raw: RawTimelineEvent): number | null {
  const t = raw.submitted_at ?? raw.created_at ?? raw.committer?.date ?? raw.author?.date;
  return t ? Date.parse(t) : null;
}

function toKind(raw: RawTimelineEvent): PrEventKind | null {
  switch (raw.event) {
    case "reviewed":
      switch ((raw.state ?? "").toUpperCase()) {
        case "APPROVED":
          return "approved";
        case "CHANGES_REQUESTED":
          return "changes_requested";
        case "COMMENTED":
          return "reviewed";
        default:
          return null; // dismissed / unknown
      }
    case "commented":
    case "line-commented":
    case "commit-commented":
      return "commented";
    case "committed":
    case "head_ref_force_pushed":
      return "committed";
    case "merged":
      return "merged";
    case "closed":
      return "closed";
    case "reopened":
      return "reopened";
    case "assigned":
      return "assigned";
    case "labeled":
    case "unlabeled":
      return "labeled";
    case "ready_for_review":
      return "ready_for_review";
    case "convert_to_draft":
      return "converted_to_draft";
    case "review_requested":
      return "review_requested";
    case "mentioned":
      return "mentioned";
    default:
      return null;
  }
}

// Pick the event that triggered a notification updated at `at`: the highest-priority
// selectable event whose timestamp is the latest at or before `at` (+ skew).
export function selectPrEvent(raw: RawTimelineEvent[], at: string): PrEvent | null {
  const cutoff = Date.parse(at) + SKEW_MS;
  let best: { kind: PrEventKind; ms: number } | null = null;
  for (const e of raw) {
    const kind = toKind(e);
    if (!kind) continue;
    const ms = eventTime(e);
    if (ms == null || ms > cutoff) continue;
    if (!best || ms > best.ms || (ms === best.ms && PRIORITY[kind] > PRIORITY[best.kind])) {
      best = { kind, ms };
    }
  }
  return best ? { kind: best.kind, at: new Date(best.ms).toISOString() } : null;
}

function lastPageUrl(link: string | null): string | null {
  if (!link) return null;
  const part = link.split(",").find((s) => s.includes('rel="last"'));
  const m = part?.match(/<([^>]+)>/);
  return m ? m[1] : null;
}

export async function fetchPrEvent(
  token: string,
  repoFullName: string,
  prNumber: number,
  at: string,
  fetchImpl: FetchLike = defaultFetch
): Promise<PrEvent | null> {
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" };
  const url = `https://api.github.com/repos/${repoFullName}/issues/${prNumber}/timeline?per_page=100`;
  const first = await fetchImpl(url, { headers });
  if (first.status !== 200) return null;

  const last = lastPageUrl(first.headers.get("link"));
  const page = last ? await fetchImpl(last, { headers }) : first;
  if (page.status !== 200) return null;

  const events = (await page.json()) as RawTimelineEvent[];
  return selectPrEvent(events, at);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/github/timeline.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/github/timeline.ts src/github/timeline.test.ts
git commit -m "feat(github): classify PR timeline events for notification labels"
```

---

### Task 2: CI check-runs verdict probe

**Files:**
- Create: `src/github/checks.ts`
- Test: `src/github/checks.test.ts`

**Interfaces:**
- Consumes: `FetchLike`, `defaultFetch` from `./http`.
- Produces:
  - `type ChecksVerdict = "passed" | "failed"`
  - `function verdictFromRuns(runs: RawCheckRun[]): ChecksVerdict | null` (pure; exported for testing)
  - `async function fetchChecksVerdict(token: string, repoFullName: string, prNumber: number, fetchImpl?: FetchLike): Promise<ChecksVerdict | null>`

- [ ] **Step 1: Write the failing test**

Create `src/github/checks.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { verdictFromRuns, fetchChecksVerdict } from "./checks";
import type { FetchLike } from "./http";

const run = (status: string, conclusion: string | null) => ({ status, conclusion });

describe("verdictFromRuns", () => {
  it("returns failed when any completed run failed", () => {
    expect(verdictFromRuns([run("completed", "success"), run("completed", "failure")])).toBe("failed");
    expect(verdictFromRuns([run("completed", "timed_out")])).toBe("failed");
  });

  it("returns passed when all completed runs succeeded (or neutral/skipped)", () => {
    expect(verdictFromRuns([run("completed", "success"), run("completed", "skipped")])).toBe("passed");
  });

  it("returns null when nothing has completed yet", () => {
    expect(verdictFromRuns([run("in_progress", null), run("queued", null)])).toBeNull();
  });

  it("returns null for no runs", () => {
    expect(verdictFromRuns([])).toBeNull();
  });
});

function seq(responses: { status: number; body: unknown }[]): FetchLike {
  let i = 0;
  return async () => {
    const r = responses[Math.min(i++, responses.length - 1)];
    return { status: r.status, ok: r.status < 400, headers: { get: () => null }, json: async () => r.body, text: async () => JSON.stringify(r.body) };
  };
}

describe("fetchChecksVerdict", () => {
  it("resolves the PR head sha then reads its check-runs", async () => {
    const f = seq([
      { status: 200, body: { head: { sha: "abc123" } } },
      { status: 200, body: { check_runs: [run("completed", "failure")] } },
    ]);
    expect(await fetchChecksVerdict("tok", "acme/repo", 42, f)).toBe("failed");
  });

  it("returns null when the PR fetch fails", async () => {
    expect(await fetchChecksVerdict("tok", "acme/repo", 42, seq([{ status: 404, body: null }]))).toBeNull();
  });

  it("returns null when the PR has no head sha", async () => {
    expect(await fetchChecksVerdict("tok", "acme/repo", 42, seq([{ status: 200, body: {} }]))).toBeNull();
  });

  it("hits the pulls and check-runs endpoints with the sha", async () => {
    const urls: string[] = [];
    const f: FetchLike = async (u) => {
      urls.push(u);
      const body = urls.length === 1 ? { head: { sha: "deadbeef" } } : { check_runs: [run("completed", "success")] };
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => body, text: async () => "" };
    };
    await fetchChecksVerdict("tok", "acme/repo", 42, f);
    expect(urls[0]).toBe("https://api.github.com/repos/acme/repo/pulls/42");
    expect(urls[1]).toBe("https://api.github.com/repos/acme/repo/commits/deadbeef/check-runs");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/github/checks.test.ts`
Expected: FAIL — `checks.ts` does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/github/checks.ts`:

```ts
import { type FetchLike, defaultFetch } from "./http";

export type ChecksVerdict = "passed" | "failed";

interface RawPr {
  head?: { sha?: string };
}
interface RawCheckRun {
  status?: string;
  conclusion?: string | null;
}
interface RawCheckRuns {
  check_runs?: RawCheckRun[];
}

const FAILING = new Set(["failure", "timed_out", "cancelled", "startup_failure", "action_required"]);

// null = still running / no checks; "failed" if any completed run failed; else "passed".
export function verdictFromRuns(runs: RawCheckRun[]): ChecksVerdict | null {
  let sawCompleted = false;
  for (const r of runs) {
    if (r.status !== "completed") continue;
    sawCompleted = true;
    if (r.conclusion && FAILING.has(r.conclusion)) return "failed";
  }
  return sawCompleted ? "passed" : null;
}

export async function fetchChecksVerdict(
  token: string,
  repoFullName: string,
  prNumber: number,
  fetchImpl: FetchLike = defaultFetch
): Promise<ChecksVerdict | null> {
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" };

  const prRes = await fetchImpl(`https://api.github.com/repos/${repoFullName}/pulls/${prNumber}`, { headers });
  if (prRes.status !== 200) return null;
  const sha = ((await prRes.json()) as RawPr).head?.sha;
  if (!sha) return null;

  const runsRes = await fetchImpl(
    `https://api.github.com/repos/${repoFullName}/commits/${sha}/check-runs`,
    { headers }
  );
  if (runsRes.status !== 200) return null;
  const body = (await runsRes.json()) as RawCheckRuns;
  return verdictFromRuns(body.check_runs ?? []);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/github/checks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/github/checks.ts src/github/checks.test.ts
git commit -m "feat(github): add CI check-runs verdict probe"
```

---

### Task 3: Rewire the notifier + poller to the event classifier

This is the atomic swap: `notifier.ts`, `poller.ts`, `index.ts`, and their tests change together because they are mutually dependent (removing `resolveVerdict` from the notifier breaks the poller). At the commit, the whole suite and typecheck pass.

**Files:**
- Modify: `src/notifier.ts` (replace the `Verdict` machinery with the `PrOutcome` label resolver)
- Modify: `src/notifier.test.ts` (replace verdict tests with outcome/label tests)
- Modify: `src/poller.ts` (swap `fetchLatestReview`/`resolveVerdict` for `fetchPrEvent` + `fetchChecksVerdict`)
- Modify: `src/poller.test.ts` (swap the fake deps and verdict scenarios)
- Modify: `src/index.ts:118-119` (wire the new deps)

**Interfaces:**
- Consumes: `PrEvent`, `PrEventKind` from `./github/timeline`; `ChecksVerdict` from `./github/checks`; `reasonMeta` from `./github/taxonomy`.
- Produces:
  - `type PrOutcome = { source: "event"; kind: PrEventKind } | { source: "checks"; verdict: ChecksVerdict }`
  - `function formatNotification(item: NotificationItem, outcome?: PrOutcome | null): string`
  - `PollerDeps.fetchPrEvent(token, repoFullName, prNumber, at): Promise<PrEvent | null>`
  - `PollerDeps.fetchChecksVerdict(token, repoFullName, prNumber): Promise<ChecksVerdict | null>`

- [ ] **Step 1: Rewrite the notifier tests (red)**

Replace the entire contents of `src/notifier.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { formatNotification, type PrOutcome } from "./notifier";
import type { NotificationItem } from "./github/notifications";

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

const authorItem: NotificationItem = { ...item, reason: "author" };

describe("formatNotification", () => {
  it("renders a reason label in the two-line masked-link layout when there is no outcome", () => {
    const [first, second] = formatNotification(item).split("\n");
    expect(first).toContain("**Review requested**");
    expect(first).toContain("acme/repo");
    const unix = Math.floor(Date.parse("2026-06-17T10:00:00Z") / 1000);
    expect(first).toContain(`<t:${unix}:R>`);
    expect(second).toBe("[#42 Fix the widget](https://github.com/acme/repo/pull/42)");
  });

  it("renders a numberless subject without a leading #", () => {
    const release = { ...item, reason: "subscribed", subjectType: "Release", subjectNumber: null, subjectTitle: "v1.2.0", subjectUrl: "https://github.com/acme/repo" };
    expect(formatNotification(release).split("\n")[1]).toBe("[v1.2.0](https://github.com/acme/repo)");
  });

  const eventCases: [PrOutcome, string, string][] = [
    [{ source: "event", kind: "approved" }, "✅", "Your PR was approved"],
    [{ source: "event", kind: "changes_requested" }, "🔧", "Changes requested on your PR"],
    [{ source: "event", kind: "reviewed" }, "💬", "New review on your PR"],
    [{ source: "event", kind: "commented" }, "💬", "New comment on your PR"],
    [{ source: "event", kind: "committed" }, "📌", "New commits on your PR"],
    [{ source: "event", kind: "merged" }, "🎉", "Your PR was merged"],
    [{ source: "event", kind: "closed" }, "🚪", "Your PR was closed"],
    [{ source: "event", kind: "reopened" }, "🔓", "Your PR was reopened"],
    [{ source: "event", kind: "ready_for_review" }, "📝", "Marked ready for review"],
    [{ source: "event", kind: "converted_to_draft" }, "📄", "Converted to draft"],
    [{ source: "event", kind: "assigned" }, "👤", "You were assigned"],
    [{ source: "event", kind: "labeled" }, "🏷️", "Labels changed on your PR"],
    [{ source: "event", kind: "review_requested" }, "🔔", "Review requested"],
    [{ source: "event", kind: "mentioned" }, "📣", "Mentioned"],
    [{ source: "checks", verdict: "passed" }, "✅", "CI passed on your PR"],
    [{ source: "checks", verdict: "failed" }, "❌", "CI failed on your PR"],
  ];

  it.each(eventCases)("renders %o as its label", (outcome, emoji, label) => {
    const first = formatNotification(item, outcome).split("\n")[0];
    expect(first).toContain(emoji);
    expect(first).toContain(`**${label}**`);
  });

  it("never shows the bare generic label for an author PR with no outcome", () => {
    const first = formatNotification(authorItem, null).split("\n")[0];
    expect(first).not.toContain("Activity on your PR");
    expect(first).toContain("**Update on your PR**");
  });

  it("keeps a specific reason label (mention) as the fallback when there is no outcome", () => {
    expect(formatNotification({ ...item, reason: "mention" }, null)).toContain("**Mentioned**");
  });
});
```

- [ ] **Step 2: Run the notifier tests to verify they fail**

Run: `npx vitest run src/notifier.test.ts`
Expected: FAIL — `PrOutcome` not exported; `formatNotification` still takes a `Verdict`.

- [ ] **Step 3: Rewrite the notifier implementation (green for notifier)**

Replace the entire contents of `src/notifier.ts` with:

```ts
import type { NotificationItem } from "./github/notifications";
import type { PrEventKind } from "./github/timeline";
import type { ChecksVerdict } from "./github/checks";
import { reasonMeta } from "./github/taxonomy";

export interface DmSender {
  sendDm(discordId: string, message: string): Promise<void>;
}

// A resolved explanation of what triggered a PR notification.
export type PrOutcome =
  | { source: "event"; kind: PrEventKind }
  | { source: "checks"; verdict: ChecksVerdict };

const PR_EVENT_LABEL: Record<PrEventKind, { emoji: string; label: string }> = {
  approved: { emoji: "✅", label: "Your PR was approved" },
  changes_requested: { emoji: "🔧", label: "Changes requested on your PR" },
  reviewed: { emoji: "💬", label: "New review on your PR" },
  commented: { emoji: "💬", label: "New comment on your PR" },
  committed: { emoji: "📌", label: "New commits on your PR" },
  merged: { emoji: "🎉", label: "Your PR was merged" },
  closed: { emoji: "🚪", label: "Your PR was closed" },
  reopened: { emoji: "🔓", label: "Your PR was reopened" },
  ready_for_review: { emoji: "📝", label: "Marked ready for review" },
  converted_to_draft: { emoji: "📄", label: "Converted to draft" },
  assigned: { emoji: "👤", label: "You were assigned" },
  labeled: { emoji: "🏷️", label: "Labels changed on your PR" },
  review_requested: { emoji: "🔔", label: "Review requested" },
  mentioned: { emoji: "📣", label: "Mentioned" },
};

const CHECKS_LABEL: Record<ChecksVerdict, { emoji: string; label: string }> = {
  passed: { emoji: "✅", label: "CI passed on your PR" },
  failed: { emoji: "❌", label: "CI failed on your PR" },
};

// GitHub's `reason` collapses to a catch-all for authored/subscribed PRs. When we
// could not classify the event, still avoid the bare "Activity on your PR".
const GENERIC_PR_REASONS = new Set(["author", "subscribed", "your_activity", "manual"]);
const PR_FALLBACK = { emoji: "🔔", label: "Update on your PR" };

function resolveMeta(item: NotificationItem, outcome: PrOutcome | null): { emoji: string; label: string } {
  if (outcome?.source === "event") return PR_EVENT_LABEL[outcome.kind];
  if (outcome?.source === "checks") return CHECKS_LABEL[outcome.verdict];
  if (item.subjectType === "PullRequest" && GENERIC_PR_REASONS.has(item.reason)) return PR_FALLBACK;
  return reasonMeta(item.reason);
}

export function formatNotification(item: NotificationItem, outcome?: PrOutcome | null): string {
  const { emoji, label } = resolveMeta(item, outcome ?? null);
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

- [ ] **Step 4: Run the notifier tests to verify they pass**

Run: `npx vitest run src/notifier.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the poller fake deps and scenarios (red)**

In `src/poller.test.ts`, update the imports and fake-dependency scaffolding.

Replace the import line:
```ts
import type { LatestReview } from "./github/reviews";
```
with:
```ts
import type { PrEvent } from "./github/timeline";
import type { ChecksVerdict } from "./github/checks";
```

Replace:
```ts
let nextReview: LatestReview | null;
```
with:
```ts
let nextEvent: PrEvent | null;
let nextChecks: ChecksVerdict | null;
```

In `deps()`, replace:
```ts
    fetchLatestReview: async () => nextReview,
```
with:
```ts
    fetchPrEvent: async () => nextEvent,
    fetchChecksVerdict: async () => nextChecks,
```

In `beforeEach`, replace:
```ts
  nextReview = null;
```
with:
```ts
  nextEvent = null;
  nextChecks = null;
```

In the "skips a user that has no baseline" test, replace:
```ts
    fetchLatestReview: async () => null,
```
with:
```ts
    fetchPrEvent: async () => null,
    fetchChecksVerdict: async () => null,
```

Replace the two verdict tests (the `it("renders the fetched verdict in the DM", …)` and `it("falls back to the generic label when the review lookup throws", …)` blocks) with:

```ts
it("renders the classified event in the DM", async () => {
  nextResult = { status: 200, items: [prItem], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: [] };
  nextEvent = { kind: "approved", at: prItem.updatedAt };
  await pollUser(deps(), user());
  expect(sent[0].message).toContain("Your PR was approved");
});

it("falls back to a CI verdict when the timeline yields no event", async () => {
  nextResult = { status: 200, items: [prItem], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: [] };
  nextEvent = null;
  nextChecks = "failed";
  await pollUser(deps(), user());
  expect(sent[0].message).toContain("CI failed on your PR");
});

it("still delivers the notification when enrichment throws", async () => {
  nextResult = { status: 200, items: [prItem], lastModified: "Mon", pollInterval: 60, ssoPartialOrgIds: [] };
  const d = deps();
  d.fetchPrEvent = async () => { throw new Error("boom"); };
  await pollUser(d, user());
  expect(sent).toHaveLength(1);
  expect(sent[0].message).toContain("Review requested"); // prItem.reason fallback, DM not dropped
});
```

- [ ] **Step 6: Run the poller tests to verify they fail**

Run: `npx vitest run src/poller.test.ts`
Expected: FAIL — `PollerDeps` still declares `fetchLatestReview`; `fetchPrEvent`/`fetchChecksVerdict` unknown.

- [ ] **Step 7: Rewire the poller implementation (green)**

In `src/poller.ts`, replace the imports:
```ts
import { resolveVerdict, formatNotification, type DmSender } from "./notifier";
import type { LatestReview } from "./github/reviews";
```
with:
```ts
import { formatNotification, type DmSender, type PrOutcome } from "./notifier";
import type { PrEvent } from "./github/timeline";
import type { ChecksVerdict } from "./github/checks";
```

Replace the `fetchLatestReview` line in `PollerDeps`:
```ts
  fetchLatestReview(token: string, repoFullName: string, prNumber: number): Promise<LatestReview | null>;
```
with:
```ts
  fetchPrEvent(token: string, repoFullName: string, prNumber: number, at: string): Promise<PrEvent | null>;
  fetchChecksVerdict(token: string, repoFullName: string, prNumber: number): Promise<ChecksVerdict | null>;
```

Replace the per-item enrichment block:
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
    try {
      await deps.sender.sendDm(user.discordId, formatNotification(item, verdict));
```
with:
```ts
    let outcome: PrOutcome | null = null;
    if (item.subjectType === "PullRequest" && item.subjectNumber != null) {
      try {
        const event = await deps.fetchPrEvent(token, item.repoFullName, item.subjectNumber, item.updatedAt);
        if (event) {
          outcome = { source: "event", kind: event.kind };
        } else {
          const verdict = await deps.fetchChecksVerdict(token, item.repoFullName, item.subjectNumber);
          if (verdict) outcome = { source: "checks", verdict };
        }
      } catch (err) {
        // Enrichment is best-effort; never let it drop the notification.
        console.warn(`Event enrichment failed for ${user.discordId} thread ${item.threadId}:`, err);
      }
    }
    try {
      await deps.sender.sendDm(user.discordId, formatNotification(item, outcome));
```

- [ ] **Step 8: Wire the new deps in index.ts**

In `src/index.ts`, replace the import:
```ts
import { fetchLatestReview } from "./github/reviews";
```
with:
```ts
import { fetchPrEvent } from "./github/timeline";
import { fetchChecksVerdict } from "./github/checks";
```

Replace the poller wiring:
```ts
    fetchLatestReview: (token, repoFullName, prNumber) =>
      fetchLatestReview(token, repoFullName, prNumber),
```
with:
```ts
    fetchPrEvent: (token, repoFullName, prNumber, at) =>
      fetchPrEvent(token, repoFullName, prNumber, at),
    fetchChecksVerdict: (token, repoFullName, prNumber) =>
      fetchChecksVerdict(token, repoFullName, prNumber),
```

- [ ] **Step 9: Run the full suite and typecheck to verify green**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS — all tests green, no type errors. (`reviews.ts` still compiles standalone; it is deleted in Task 4.)

- [ ] **Step 10: Commit**

```bash
git add src/notifier.ts src/notifier.test.ts src/poller.ts src/poller.test.ts src/index.ts
git commit -m "feat(notifications): label PR notifications by their actual event"
```

---

### Task 4: Retire the dead reviews module

`reviews.ts` / `resolveVerdict` / `VERDICT_TOLERANCE_MS` are now unreferenced (verified: only `notifier.ts`, `poller.ts`, `index.ts`, and `reviews.test.ts` ever imported them, and the first three were rewired in Task 3).

**Files:**
- Delete: `src/github/reviews.ts`
- Delete: `src/github/reviews.test.ts`

- [ ] **Step 1: Confirm no remaining references**

Run: `grep -rn "reviews\"\|fetchLatestReview\|resolveVerdict\|LatestReview\|VERDICT_TOLERANCE" src`
Expected: no matches (empty output). If anything prints, fix that reference before deleting.

- [ ] **Step 2: Delete the files**

```bash
git rm src/github/reviews.ts src/github/reviews.test.ts
```

- [ ] **Step 3: Run the full suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS — no missing-import or type errors.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(github): remove the superseded reviews verdict module"
```

---

## Self-Review

**Spec coverage:**
- Timeline classifier + all 14 event kinds → Task 1 (`timeline.ts`, `PR_EVENT_LABEL` in Task 3). ✅
- CI passed/failed probe → Task 2 + `CHECKS_LABEL` (Task 3). ✅
- Selection rule (latest event ≤ updatedAt + skew), priority tie-break → Task 1 `selectPrEvent`. ✅
- Fallback chain (event → checks → descriptive reason, never bare generic) → Task 3 `resolveMeta` + poller flow. ✅
- Retire reviews.ts / resolveVerdict / tolerance hack → Task 3 (rewire) + Task 4 (delete). ✅
- Subscriptions unchanged; best-effort enrichment never drops a notification → Task 3 poller block (try/catch preserved) + poller test. ✅
- API-cost mitigations (unseen threads only, last-page-only, best-effort) → dedup gate unchanged; `fetchPrEvent` Link-last-page; try/catch. ✅
- Label taxonomy strings/emoji → Task 3 tables (match spec table exactly). ✅
- Out of scope (digest, webhooks, Issue/Discussion specificity) → untouched. ✅

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step is complete. ✅

**Type consistency:** `PrEvent`/`PrEventKind` (timeline) and `ChecksVerdict` (checks) are produced in Tasks 1–2 and consumed identically in Task 3; `PrOutcome` shape (`{source:"event",kind}` / `{source:"checks",verdict}`) matches between `notifier.ts`, `notifier.test.ts`, and `poller.ts`; `fetchPrEvent(token, repo, prNumber, at)` and `fetchChecksVerdict(token, repo, prNumber)` signatures match across `timeline.ts`/`checks.ts`, `PollerDeps`, the poller fakes, and `index.ts`. ✅
