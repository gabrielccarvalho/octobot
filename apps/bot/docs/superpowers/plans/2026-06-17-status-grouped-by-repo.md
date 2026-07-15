# `/status` Grouped-by-Repo Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the `/status` PR sections to group PRs by repository under bold repo headers, with each PR line showing `#<number> [<title≤59>](<url>) · <relative time>`.

**Architecture:** A single presentation change in `src/discord/handlers.ts` — add a `groupByRepo` helper and a `relativeTime` helper, change the title cap from 70 to 59, and rewrite `renderSection` to slice-to-cap → group → emit repo blocks. No change to the data layer (`github/search.ts` already provides `updatedAt`), the discord adapter, or `index.ts`. `handleStatus`'s signature, not-connected path, error handling, and the `clampMessage` backstop are unchanged.

**Tech Stack:** TypeScript (CommonJS), discord.js v14, vitest.

---

### Task 1: Group `/status` PRs by repo with relative timestamps

**Files:**
- Modify: `src/discord/handlers.ts` (replace the entire file)
- Modify: `src/discord/handlers.test.ts` (replace the entire file)

Read both files first to confirm the current state, then replace them as below.

- [ ] **Step 1: Replace `src/discord/handlers.test.ts`** (this encodes the new format and will fail against the current implementation)

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDatabase, type Database } from "../db";
import {
  handleLink,
  handleUnlink,
  handleStatus,
  type CommandContext,
  type LinkDeps,
  type StatusDeps,
  type AttentionList,
} from "./handlers";
import type { PrSummary } from "../github/search";

let db: Database;
let replies: string[];

const linkDeps: LinkDeps = {
  generateState: () => "test-state",
  authorizeUrl: (state) => `https://github.com/login/oauth/authorize?state=${state}`,
};

function ctx(userId = "user1"): CommandContext {
  return { userId, guildId: "g1", getOption: () => null, reply: async (m) => { replies.push(m); } };
}

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

function statusDeps(list: AttentionList): StatusDeps {
  return { listAttention: async () => list };
}

beforeEach(() => {
  db = createDatabase(":memory:");
  replies = [];
});

describe("/link", () => {
  it("stores a state and replies with an authorize URL", async () => {
    await handleLink(ctx(), db, linkDeps);
    expect(replies[0]).toContain("https://github.com/login/oauth/authorize?state=test-state");
    expect(db.consumeState("test-state", 60_000)).toBe("user1");
  });
});

describe("/unlink", () => {
  it("removes an existing connection", async () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    await handleUnlink(ctx(), db);
    expect(db.getUser("user1")).toBeNull();
    expect(replies[0]).toMatch(/disconnected/i);
  });

  it("reports when not connected", async () => {
    await handleUnlink(ctx(), db);
    expect(replies[0]).toMatch(/not connected/i);
  });
});

describe("/status", () => {
  it("tells unconnected users to /link and does not call the API", async () => {
    const listAttention = vi.fn();
    await handleStatus(ctx(), db, { listAttention });
    expect(replies[0]).toMatch(/not connected/i);
    expect(listAttention).not.toHaveBeenCalled();
  });

  it("groups PRs by repo with per-PR lines and a relative timestamp", async () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    await handleStatus(
      ctx(),
      db,
      statusDeps({
        incoming: [
          pr(128, "Add rate limiting", "acme/api"),
          pr(130, "Fix pagination", "acme/api"),
          pr(54, "Fix nav overflow", "acme/web"),
        ],
        mine: [],
      })
    );
    const msg = replies[0];
    expect(msg).toContain("octocat");
    expect(msg).toContain("**acme/api**");
    expect(msg).toContain("**acme/web**");
    expect(msg).toContain(
      `#128 [Add rate limiting](https://github.com/acme/api/pull/128) · <t:${UNIX}:R>`
    );
    expect(msg).toContain(
      `#54 [Fix nav overflow](https://github.com/acme/web/pull/54) · <t:${UNIX}:R>`
    );
    // both acme/api PRs sit under a single acme/api header
    expect(msg.match(/\*\*acme\/api\*\*/g)).toHaveLength(1);
  });

  it("truncates a long title to 59 characters", async () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    const longTitle = "x".repeat(80);
    await handleStatus(ctx(), db, statusDeps({ incoming: [pr(1, longTitle)], mine: [] }));
    expect(replies[0]).toContain(`[${"x".repeat(58)}…]`);
    expect(replies[0]).not.toContain("x".repeat(60));
  });

  it("shows friendly empty-state lines when sections are empty", async () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    await handleStatus(ctx(), db, statusDeps({ incoming: [], mine: [] }));
    expect(replies[0]).toMatch(/Nothing awaiting your review/i);
    expect(replies[0]).toMatch(/No open PRs of yours/i);
  });

  it("caps a section at 10 PRs before grouping and notes the remainder", async () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    const many = Array.from({ length: 13 }, (_, i) => pr(i + 1));
    await handleStatus(ctx(), db, statusDeps({ incoming: many, mine: [] }));
    const prLines = replies[0].split("\n").filter((l) => /^#\d+ /.test(l));
    expect(prLines).toHaveLength(10);
    expect(replies[0]).toContain("…and 3 more");
  });

  it("keeps the reply within Discord's 2000-char limit", async () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    const full = (repo: string) =>
      Array.from({ length: 10 }, (_, i) => pr(i + 1, "y".repeat(59), repo));
    await handleStatus(ctx(), db, statusDeps({ incoming: full("acme/api"), mine: full("acme/web") }));
    expect(replies[0].length).toBeLessThanOrEqual(2000);
  });

  it("asks to reconnect on a 401 error", async () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    const deps: StatusDeps = {
      listAttention: async () => {
        throw Object.assign(new Error("401"), { status: 401 });
      },
    };
    await handleStatus(ctx(), db, deps);
    expect(replies[0]).toMatch(/expired|reconnect|\/link/i);
  });

  it("shows a generic error on other failures", async () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    const deps: StatusDeps = {
      listAttention: async () => {
        throw new Error("boom");
      },
    };
    await handleStatus(ctx(), db, deps);
    expect(replies[0]).toMatch(/try again/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/discord/handlers.test.ts`
Expected: FAIL — the "groups PRs by repo…" / truncation / cap tests fail because the current renderer emits the old `• [repo #n title](url)` lines (no repo headers, no `#n ` prefix line, 70-char titles, no `<t:…:R>`).

- [ ] **Step 3: Replace `src/discord/handlers.ts`** (entire file)

```ts
import type { Database, User } from "../db";
import type { PrSummary } from "../github/search";

export interface CommandContext {
  userId: string;
  guildId: string | null;
  getOption(name: string): string | null;
  reply(message: string): Promise<void>;
}

export interface LinkDeps {
  generateState(): string;
  authorizeUrl(state: string): string;
}

export interface AttentionList {
  incoming: PrSummary[];
  mine: PrSummary[];
}

export interface StatusDeps {
  listAttention(user: User): Promise<AttentionList>;
}

export async function handleLink(ctx: CommandContext, db: Database, deps: LinkDeps): Promise<void> {
  const state = deps.generateState();
  db.createState(state, ctx.userId);
  await ctx.reply(
    `🔗 Connect your GitHub account to receive PR notifications:\n${deps.authorizeUrl(state)}\n\nThis link is personal — don't share it. It expires shortly.`
  );
}

export async function handleUnlink(ctx: CommandContext, db: Database): Promise<void> {
  const removed = db.deleteUser(ctx.userId);
  await ctx.reply(
    removed ? "✅ Disconnected. You'll no longer receive notifications." : "You're not connected."
  );
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

  const header = `✅ Connected as \`${user.githubLogin}\``;

  let list: AttentionList;
  try {
    list = await deps.listAttention(user);
  } catch (err) {
    const status = (err as { status?: number }).status;
    const note =
      status === 401
        ? "Your GitHub connection expired — run `/link` to reconnect."
        : "Couldn't reach GitHub right now — try again in a moment.";
    await ctx.reply(`${header}\n\n${note}`);
    return;
  }

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
  await ctx.reply(clampMessage(`${header}\n\n${incoming}\n\n${mine}`));
}
```

- [ ] **Step 4: Run the handler tests to verify they pass**

Run: `npx vitest run src/discord/handlers.test.ts`
Expected: PASS (11 tests: 1 link + 2 unlink + 8 status).

- [ ] **Step 5: Verify build + full suite**

Run: `npm run build` → exit 0.
Run: `npm test` → all suites pass (≈11 files, ≈56 tests).

- [ ] **Step 6: Commit**

```bash
git add src/discord/handlers.ts src/discord/handlers.test.ts
git commit -m "feat: group /status PRs by repo with relative timestamps"
```

---

## Self-Review Notes

- **Spec coverage:** repo grouping with bold headers + first-seen order (`groupByRepo`, `renderSection`); per-PR line `#num [title≤59](url) · <t:…:R>` (`renderSection` line builder + `truncate` at 59 + `relativeTime`); relative time from `updatedAt`; 10-cap applied *before* grouping with `…and K more`; empty-state lines, section count `(N)`, error/not-connected paths, and `clampMessage` all unchanged. Tests cover grouping, per-line format + timestamp, 59-char truncation, cap-before-grouping, empty states, 2000-char clamp, and both error paths. All spec sections map to steps.
- **Type consistency:** uses the existing `PrSummary` (`repoFullName`, `number`, `title`, `url`, `updatedAt`), `StatusDeps`/`AttentionList`, and `handleStatus(ctx, db, deps)` signature — unchanged from the current code; only internal helpers and the render change.
- **No placeholders:** full file contents and exact commands provided.
- **Single-file scope:** only `handlers.ts` + its test change; adapter/index/search untouched, so the build stays consistent.
