# New-User Onboarding Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On connect, send one `/status`-style summary DM and baseline the user so the poller stops flooding new users with every existing notification.

**Architecture:** Extract the `/status` summary renderer into a shared `formatAttention` (`src/status.ts`); add a `createOnConnect` factory (`src/onboarding.ts`) that baselines (mark current threads seen + set `last_modified`) and sends the summary; wire it into the OAuth callback and skip un-baselined users in the poller.

**Tech Stack:** Node 20, TypeScript (CommonJS), discord.js v14, Fastify v4, better-sqlite3, vitest.

## Global Constraints

- Strict CommonJS TypeScript; tests are vitest; test files are excluded from `tsc`.
- Plain commit messages — no co-author / "generated with" trailers.
- Do NOT run `git checkout`/`git switch` in any subagent; stay on the working branch.
- Masked links (`[text](url)`) — never bare URLs (avoids Discord embeds).
- Existing public types are unchanged: `PrSummary` (`src/github/search.ts`:
  `{repoFullName, number, title, url, updatedAt}`), `FetchResult`
  (`src/github/notifications.ts`: `{status, items, lastModified, pollInterval}`),
  `DmSender` (`src/notifier.ts`: `{ sendDm(discordId, message): Promise<void> }`),
  `User` (`src/db.ts`: includes `githubLogin`, `lastModified: string | null`,
  `tokenCiphertext/tokenIv/tokenTag`). `db` exposes `markNotified(discordId,
  threadId, updatedAt)`, `updateLastModified(discordId, lastModified)`,
  `getUser`, `upsertUser`. Search query constants `QUERY_AWAITING_MY_REVIEW`,
  `QUERY_MY_PRS_AWAITING_REVIEW` and `searchPullRequests(token, query, fetchImpl?)`
  live in `src/github/search.ts`.

---

### Task 1: Extract the shared `/status` summary formatter

Move the connected-summary rendering out of `handlers.ts` into `src/status.ts`
so `/status` and onboarding produce identical content. Behavior is unchanged.

**Files:**
- Create: `src/status.ts`
- Create: `src/status.test.ts`
- Modify: `src/discord/handlers.ts`
- Modify: `src/discord/handlers.test.ts`

**Interfaces:**
- Produces: `AttentionList { incoming: PrSummary[]; mine: PrSummary[] }` and
  `formatAttention(githubLogin: string, list: AttentionList): string` — both from
  `src/status.ts`.
- Consumes: `PrSummary` from `src/github/search.ts`.

- [ ] **Step 1: Create `src/status.ts`**

```ts
import type { PrSummary } from "./github/search";

export interface AttentionList {
  incoming: PrSummary[];
  mine: PrSummary[];
}

const MAX_PER_SECTION = 10;
const MAX_TITLE = 59;
const MAX_MESSAGE = 2000;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function clampMessage(message: string): string {
  return message.length > MAX_MESSAGE ? `${message.slice(0, MAX_MESSAGE - 1)}…` : message;
}

// Discord renders <t:UNIX:R> as a localized, auto-updating "5 minutes ago".
function relativeTime(iso: string): string {
  return `<t:${Math.floor(new Date(iso).getTime() / 1000)}:R>`;
}

// Group PRs by repo, preserving first-seen order of both repos and PRs.
function groupByRepo(prs: PrSummary[]): { repo: string; prs: PrSummary[] }[] {
  const groups: { repo: string; prs: PrSummary[] }[] = [];
  const index = new Map<string, PrSummary[]>();
  for (const pr of prs) {
    let bucket = index.get(pr.repoFullName);
    if (!bucket) {
      bucket = [];
      index.set(pr.repoFullName, bucket);
      groups.push({ repo: pr.repoFullName, prs: bucket });
    }
    bucket.push(pr);
  }
  return groups;
}

function renderSection(label: string, prs: PrSummary[], emptyLine: string): string {
  if (prs.length === 0) return `${label}\n${emptyLine}`;
  const blocks = groupByRepo(prs.slice(0, MAX_PER_SECTION)).map((group) => {
    const lines = group.prs
      .map(
        (p) => `#${p.number} [${truncate(p.title, MAX_TITLE)}](${p.url}) · ${relativeTime(p.updatedAt)}`
      )
      .join("\n");
    return `**${group.repo}**\n${lines}`;
  });
  const more = prs.length > MAX_PER_SECTION ? `\n…and ${prs.length - MAX_PER_SECTION} more` : "";
  return `${label} (${prs.length})\n${blocks.join("\n")}${more}`;
}

export function formatAttention(githubLogin: string, list: AttentionList): string {
  const header = `✅ Connected as \`${githubLogin}\``;
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

- [ ] **Step 2: Create `src/status.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { formatAttention, type AttentionList } from "./status";
import type { PrSummary } from "./github/search";

const UPDATED_AT = "2026-06-17T10:00:00Z";
const UNIX = Math.floor(Date.parse(UPDATED_AT) / 1000);

function pr(n: number, title = "Title", repo = "acme/repo"): PrSummary {
  return {
    repoFullName: repo,
    number: n,
    title,
    url: `https://github.com/${repo}/pull/${n}`,
    updatedAt: UPDATED_AT,
  };
}

function attention(over: Partial<AttentionList> = {}): AttentionList {
  return { incoming: [], mine: [], ...over };
}

describe("formatAttention", () => {
  it("renders the header and groups PRs by repo with relative timestamps", () => {
    const msg = formatAttention(
      "octocat",
      attention({
        incoming: [
          pr(128, "Add rate limiting", "acme/api"),
          pr(130, "Fix pagination", "acme/api"),
          pr(54, "Fix nav overflow", "acme/web"),
        ],
      })
    );
    expect(msg).toContain("✅ Connected as `octocat`");
    expect(msg).toContain("**acme/api**");
    expect(msg).toContain("**acme/web**");
    expect(msg).toContain(
      `#128 [Add rate limiting](https://github.com/acme/api/pull/128) · <t:${UNIX}:R>`
    );
    expect(msg.match(/\*\*acme\/api\*\*/g)).toHaveLength(1);
  });

  it("truncates a long title to 59 characters", () => {
    const msg = formatAttention("octocat", attention({ incoming: [pr(1, "x".repeat(80))] }));
    expect(msg).toContain(`[${"x".repeat(58)}…]`);
    expect(msg).not.toContain("x".repeat(60));
  });

  it("shows friendly empty-state lines for empty sections", () => {
    const msg = formatAttention("octocat", attention());
    expect(msg).toMatch(/Nothing awaiting your review/i);
    expect(msg).toMatch(/No open PRs of yours/i);
  });

  it("caps a section at 10 PRs and notes the remainder", () => {
    const many = Array.from({ length: 13 }, (_, i) => pr(i + 1));
    const msg = formatAttention("octocat", attention({ incoming: many }));
    const prLines = msg.split("\n").filter((l) => /^#\d+ /.test(l));
    expect(prLines).toHaveLength(10);
    expect(msg).toContain("…and 3 more");
  });

  it("clamps an oversized message to 2000 characters", () => {
    const full = (repo: string) =>
      Array.from({ length: 10 }, (_, i) => pr(i + 1, "y".repeat(59), repo));
    const msg = formatAttention("octocat", attention({ incoming: full("acme/api"), mine: full("acme/web") }));
    expect(msg.length).toBeLessThanOrEqual(2000);
  });
});
```

- [ ] **Step 3: Run the new test to verify it fails**

Run: `npx vitest run src/status.test.ts`
Expected: FAIL — cannot find module `./status`.

- [ ] **Step 4: Run it to verify it passes** (after Step 1 file exists)

Run: `npx vitest run src/status.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Refactor `src/discord/handlers.ts` to use the shared formatter**

Read the current file. Make these changes:
- Remove the local `AttentionList` interface and the local render helpers
  (`MAX_PER_SECTION`, `MAX_TITLE`, `MAX_MESSAGE`, `truncate`, `clampMessage`,
  `relativeTime`, `groupByRepo`, `renderSection`).
- Add imports at the top: `import { formatAttention, type AttentionList } from "../status";`
- Keep `StatusDeps` (it references the imported `AttentionList`):

```ts
export interface StatusDeps {
  listAttention(user: User): Promise<AttentionList>;
}
```

- Replace the connected branch of `handleStatus` so the whole reply comes from
  `formatAttention`. The final `handleStatus` is:

```ts
export async function handleStatus(
  ctx: CommandContext,
  db: Database,
  deps: StatusDeps
): Promise<void> {
  const user = db.getUser(ctx.userId);
  if (!user) {
    await ctx.reply("You're not connected. Run `/link` to connect your GitHub account.");
    return;
  }

  try {
    const list = await deps.listAttention(user);
    await ctx.reply(formatAttention(user.githubLogin, list));
  } catch (err) {
    const status = (err as { status?: number }).status;
    const note =
      status === 401
        ? "Your GitHub connection expired — run `/link` to reconnect."
        : "Couldn't reach GitHub right now — try again in a moment.";
    await ctx.reply(`✅ Connected as \`${user.githubLogin}\`\n\n${note}`);
  }
}
```

(Leave `handleLink`, `handleUnlink`, `CommandContext`, `LinkDeps` unchanged.)

- [ ] **Step 6: Trim `src/discord/handlers.test.ts`**

Read the file. In the `describe("/status")` block, REMOVE the rendering-detail
tests now covered by `status.test.ts` (the "groups PRs by repo…", "truncates a
long title…", "caps a section…", and "keeps the reply within…2000…" tests).
KEEP and ensure these remain: "tells unconnected users to /link and does not
call the API", "asks to reconnect on a 401 error", "shows a generic error on
other failures". ADD one connected smoke test:

```ts
  it("renders the connected summary via the shared formatter", async () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    await handleStatus(
      ctx(),
      db,
      statusDeps({ incoming: [pr(7, "Fix bug")], mine: [] })
    );
    expect(replies[0]).toContain("✅ Connected as `octocat`");
    expect(replies[0]).toContain("**acme/repo**");
    expect(replies[0]).toContain("#7 [Fix bug](https://github.com/acme/repo/pull/7)");
  });
```

The existing `pr(...)` and `statusDeps(...)` helpers and the `AttentionList`
import in this test file stay (import `AttentionList` from `../status` now, and
`StatusDeps` from `./handlers`). The `/link` and `/unlink` blocks are unchanged.

- [ ] **Step 7: Run build + full suite**

Run: `npm run build` → exit 0.
Run: `npm test` → all suites pass (status + handlers + the rest).

- [ ] **Step 8: Commit**

```bash
git add src/status.ts src/status.test.ts src/discord/handlers.ts src/discord/handlers.test.ts
git commit -m "refactor: extract shared /status summary formatter into status.ts"
```

---

### Task 2: `createOnConnect` onboarding factory

**Files:**
- Create: `src/onboarding.ts`
- Test: `src/onboarding.test.ts`

**Interfaces:**
- Consumes: `formatAttention`/`AttentionList` (`src/status.ts`), `PrSummary`
  (`src/github/search.ts`), `FetchResult` (`src/github/notifications.ts`),
  `DmSender` (`src/notifier.ts`), `Database` (`src/db.ts`).
- Produces: `createOnConnect(deps: OnConnectDeps): (discordId, token, githubLogin) => Promise<void>`.

- [ ] **Step 1: Write the failing test** (`src/onboarding.test.ts`)

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDatabase, type Database } from "./db";
import { createOnConnect } from "./onboarding";
import type { FetchResult } from "./github/notifications";
import type { PrSummary } from "./github/search";
import type { DmSender } from "./notifier";

let db: Database;
let sent: { discordId: string; message: string }[];
let sender: DmSender;

function pr(n: number): PrSummary {
  return {
    repoFullName: "acme/repo",
    number: n,
    title: `PR ${n}`,
    url: `https://github.com/acme/repo/pull/${n}`,
    updatedAt: "2026-06-17T10:00:00Z",
  };
}

function deps(over: {
  fetchResult?: FetchResult | (() => Promise<FetchResult>);
  search?: PrSummary[];
} = {}) {
  const fetchResult =
    over.fetchResult ??
    ({ status: 200, items: [], lastModified: "Mon, 01 Jan 2026 00:00:00 GMT", pollInterval: 60 } as FetchResult);
  return {
    db,
    sender,
    fetchNotifications: vi.fn(async () =>
      typeof fetchResult === "function" ? await (fetchResult as () => Promise<FetchResult>)() : fetchResult
    ),
    searchPullRequests: vi.fn(async () => over.search ?? []),
    awaitingQuery: "AWAIT",
    minePrsQuery: "MINE",
  };
}

beforeEach(() => {
  db = createDatabase(":memory:");
  db.upsertUser("d1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
  sent = [];
  sender = { sendDm: async (discordId, message) => { sent.push({ discordId, message }); } };
});

it("baselines current threads, sets the watermark, and sends one summary DM", async () => {
  const d = deps({
    fetchResult: {
      status: 200,
      items: [
        { threadId: "t1", reason: "review_requested", updatedAt: "U1", repoFullName: "acme/repo", prNumber: 1, prTitle: "x", prUrl: "u" },
      ],
      lastModified: "Mon, 01 Jan 2026 00:00:00 GMT",
      pollInterval: 60,
    } as FetchResult,
    search: [pr(7)],
  });
  const onConnect = createOnConnect(d);
  await onConnect("d1", "tok", "octocat");

  expect(db.wasNotified("d1", "t1", "U1")).toBe(true);
  expect(db.getUser("d1")?.lastModified).toBe("Mon, 01 Jan 2026 00:00:00 GMT");
  expect(sent).toHaveLength(1);
  expect(sent[0].discordId).toBe("d1");
  expect(sent[0].message).toContain("✅ Connected as `octocat`");
  expect(d.searchPullRequests).toHaveBeenCalledTimes(2);
});

it("still sets a watermark when the baseline fetch fails", async () => {
  const d = deps({ fetchResult: async () => { throw new Error("network"); } });
  const onConnect = createOnConnect(d);
  await onConnect("d1", "tok", "octocat");
  expect(db.getUser("d1")?.lastModified).toBeTruthy();
  expect(sent).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/onboarding.test.ts`
Expected: FAIL — cannot find module `./onboarding`.

- [ ] **Step 3: Write `src/onboarding.ts`**

```ts
import type { Database } from "./db";
import type { FetchResult } from "./github/notifications";
import type { PrSummary } from "./github/search";
import type { DmSender } from "./notifier";
import { formatAttention } from "./status";

export interface OnConnectDeps {
  db: Database;
  sender: DmSender;
  fetchNotifications(token: string, lastModified: string | null): Promise<FetchResult>;
  searchPullRequests(token: string, query: string): Promise<PrSummary[]>;
  awaitingQuery: string;
  minePrsQuery: string;
}

// Runs once when a user connects: baseline their notifications (so the poller
// won't flood them) and send a single /status-style summary DM.
export function createOnConnect(deps: OnConnectDeps) {
  return async (discordId: string, token: string, githubLogin: string): Promise<void> => {
    // 1. Baseline: record current PR threads as already-seen and set the
    //    last-modified watermark — without DMing any of them.
    let watermark = new Date().toUTCString();
    try {
      const res = await deps.fetchNotifications(token, null);
      if (res.status === 200) {
        for (const item of res.items) {
          deps.db.markNotified(discordId, item.threadId, item.updatedAt);
        }
        if (res.lastModified) watermark = res.lastModified;
      }
    } catch (err) {
      console.warn(`Onboarding baseline failed for ${discordId}:`, err);
    }
    deps.db.updateLastModified(discordId, watermark);

    // 2. Summary: the same content as /status, as one DM.
    const [incoming, mine] = await Promise.all([
      deps.searchPullRequests(token, deps.awaitingQuery),
      deps.searchPullRequests(token, deps.minePrsQuery),
    ]);
    await deps.sender.sendDm(discordId, formatAttention(githubLogin, { incoming, mine }));
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/onboarding.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/onboarding.ts src/onboarding.test.ts
git commit -m "feat: add onboarding factory (baseline + summary on connect)"
```

---

### Task 3: Wire onboarding into the callback + skip un-baselined users in the poller

**Files:**
- Modify: `src/http/routes.ts`, `src/http/routes.test.ts`
- Modify: `src/poller.ts`, `src/poller.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `createOnConnect` (`src/onboarding.ts`), `searchPullRequests` +
  `QUERY_AWAITING_MY_REVIEW` + `QUERY_MY_PRS_AWAITING_REVIEW` +
  `fetchNotifications`, the Discord `sender`.
- Produces: `HttpDeps.onConnect(discordId, token, githubLogin): Promise<void>`.

- [ ] **Step 1: Add the failing poller test** — append to `src/poller.test.ts`'s `/status`-less poller suite. First, read the file; the existing tests `upsertUser("d1", ...)` then expect DMs. Because un-baselined users are now skipped, add `db.updateLastModified("d1", "Mon");` immediately after each `db.upsertUser("d1", ...)` in the existing tests (in `beforeEach` if the upsert is there, otherwise per-test). Then add this new test:

```ts
it("skips a user that has no baseline (null lastModified)", async () => {
  const fresh = createDatabase(":memory:");
  fresh.upsertUser("d2", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
  const fetchNotifications = vi.fn(async () => nextResult);
  const localDeps: PollerDeps = {
    db: fresh,
    sender,
    decryptToken: () => "tok",
    fetchNotifications,
  };
  await pollUser(localDeps, fresh.getUser("d2")!);
  expect(fetchNotifications).not.toHaveBeenCalled();
  expect(sent).toHaveLength(0);
});
```

(If the existing tests build `PollerDeps` via a `deps()` helper with a non-spy
`fetchNotifications`, keep using that for them; this new test uses its own spy.
Ensure `PollerDeps` and `createDatabase`/`vi` are imported — they already are.)

- [ ] **Step 2: Run poller test to verify the new test fails**

Run: `npx vitest run src/poller.test.ts`
Expected: FAIL — the "skips a user that has no baseline" test fails because
`pollUser` currently fetches regardless of `lastModified`.

- [ ] **Step 3: Add the guard to `src/poller.ts`**

In `pollUser`, immediately after decrypting the token (or as the very first
statement), return early when the user has no baseline:

```ts
export async function pollUser(deps: PollerDeps, user: User): Promise<void> {
  if (!user.lastModified) return; // not yet baselined by onboarding; skip to avoid a flood
  // ... existing body unchanged ...
}
```

- [ ] **Step 4: Run poller tests to verify they pass**

Run: `npx vitest run src/poller.test.ts`
Expected: PASS (existing tests — now with watermarks set — plus the new skip test).

- [ ] **Step 5: Add `onConnect` to `src/http/routes.ts`**

Read the file. Add `onConnect` to `HttpDeps`:

```ts
export interface HttpDeps {
  db: Database;
  encrypt(token: string): Encrypted;
  exchangeCode(code: string): Promise<string>;
  fetchViewerLogin(token: string): Promise<string>;
  stateTtlMs: number;
  onConnect(discordId: string, token: string, githubLogin: string): Promise<void>;
}
```

In the `/oauth/callback` success branch, after `deps.db.upsertUser(...)` and
before sending the success page, call the hook (best-effort — never fail the
page on its account):

```ts
      deps.db.upsertUser(discordId, login, deps.encrypt(token));
      try {
        await deps.onConnect(discordId, token, login);
      } catch (err) {
        req.log.error(err);
      }
      return reply
        .type("text/html")
        .send(page("Connected", `Connected as <b>${login}</b>. You can return to Discord.`));
```

- [ ] **Step 6: Update `src/http/routes.test.ts`**

Read the file. Add an `onConnect` to the deps that `buildApp` passes (default a
`vi.fn(async () => {})`), so existing tests still construct valid deps. Add one
test asserting it's invoked on a successful callback:

```ts
  it("calls onConnect with the discord id, token, and login on success", async () => {
    db.createState("s9", "discord-9");
    const onConnect = vi.fn(async () => {});
    const app = await buildApp({ onConnect });
    const res = await app.inject({ method: "GET", url: "/oauth/callback?code=abc&state=s9" });
    expect(res.statusCode).toBe(200);
    expect(onConnect).toHaveBeenCalledWith("discord-9", "gho_token", "octocat");
  });
```

Make sure `buildApp` threads an `onConnect` override into the deps (alongside the
existing `exchangeCode`/`fetchViewerLogin` overrides) and defaults it to
`vi.fn(async () => {})`. `vi` is already imported.

- [ ] **Step 7: Wire `onConnect` in `src/index.ts`**

Read the file. Add imports:

```ts
import { createOnConnect } from "./onboarding";
```

(`searchPullRequests`, `QUERY_AWAITING_MY_REVIEW`, `QUERY_MY_PRS_AWAITING_REVIEW`
are already imported for `statusDeps`; `fetchNotifications` and `encrypt`/`decrypt`
are already imported; `sender` comes from `startDiscord`.)

Build the hook after `startDiscord` (so `sender` exists) and pass it into
`registerHttpRoutes`'s deps object:

```ts
  const onConnect = createOnConnect({
    db,
    sender,
    fetchNotifications: (token, lastModified) => fetchNotifications(token, lastModified),
    searchPullRequests: (token, query) => searchPullRequests(token, query),
    awaitingQuery: QUERY_AWAITING_MY_REVIEW,
    minePrsQuery: QUERY_MY_PRS_AWAITING_REVIEW,
  });

  registerHttpRoutes(app, {
    db,
    encrypt: (token) => encrypt(token, config.tokenEncryptionKey),
    exchangeCode: (code) =>
      exchangeCode({
        clientId: config.githubOAuthClientId,
        clientSecret: config.githubOAuthClientSecret,
        code,
      }),
    fetchViewerLogin: (token) => fetchViewerLogin(token),
    stateTtlMs: STATE_TTL_MS,
    onConnect,
  });
```

(If `registerHttpRoutes(app, {...})` is currently called before `startDiscord`,
move the `app`/`registerHttpRoutes` block to after `startDiscord` so `sender` is
in scope. Keep `app.listen(...)` and `startPoller(...)` after it, in their
existing order.)

- [ ] **Step 8: Verify build + full suite**

Run: `npm run build` → exit 0.
Run: `npm test` → all suites pass (status, onboarding, handlers, routes, poller,
and the rest).

- [ ] **Step 9: Commit**

```bash
git add src/http/routes.ts src/http/routes.test.ts src/poller.ts src/poller.test.ts src/index.ts
git commit -m "feat: send onboarding summary on connect and skip un-baselined users in the poller"
```

---

## Self-Review Notes

- **Spec coverage:** shared formatter extraction (Task 1); baseline + summary
  factory (`createOnConnect`, Task 2); callback wiring + index wiring + poller
  skip-null guard (Task 3). Error handling: `onConnect` best-effort in the
  callback (Task 3 Step 5), watermark fallback to `new Date().toUTCString()` on
  baseline-fetch failure (Task 2). Re-link behavior is inherent (upsertUser nulls
  `lastModified`; poller skips until re-baselined). Testing across all four touched
  units. All spec sections map to a task.
- **Type consistency:** `formatAttention(githubLogin, list)` and `AttentionList`
  defined in Task 1, consumed by Tasks 2 & in handlers; `OnConnectDeps` /
  `createOnConnect` signature in Task 2 matches the `index.ts` wiring and the
  `HttpDeps.onConnect` signature in Task 3; `markNotified`/`updateLastModified`/
  `getUser`/`upsertUser`/`wasNotified` match `db.ts`; `FetchResult` items carry
  `threadId`/`updatedAt` (used by `markNotified`).
- **No placeholders:** full file contents for new files; precise, complete edits
  for modified files with exact commands.
- **Green-at-each-commit:** Task 1 is a behavior-preserving refactor (suite green);
  Task 2 is additive (new file + test); Task 3 changes the coupled callback/poller/
  index together and restores green at Step 8.
