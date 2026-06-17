# `/status` Attention List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/status` also list, for a connected user, the PRs awaiting their review and their own open PRs still awaiting review — via the GitHub Search API.

**Architecture:** A new additive `github/search.ts` client (built and tested first, keeping the suite green), then a single wiring task that updates `handleStatus` (new sections + injected `StatusDeps`), the discord adapter (defer `/status`, defer-aware reply), and the composition root (`index.ts`) together — they're coupled by the `handleStatus` signature change.

**Tech Stack:** Node 20 (global `fetch`), TypeScript (CommonJS), discord.js v14, vitest.

---

## File Structure

```
src/
  github/search.ts        searchPullRequests + PrSummary + query constants      (NEW)
  discord/handlers.ts     handleStatus gains two sections + StatusDeps          (CHANGED)
  discord/handlers.test.ts  /status tests rewritten; /link, /unlink unchanged   (CHANGED)
  discord/client.ts       startDiscord(token, db, linkDeps, statusDeps); defer  (CHANGED)
  index.ts                build statusDeps (decrypt + 2 searches), pass it       (CHANGED)
```

Shared types:

```ts
// github/search.ts
export interface PrSummary {
  repoFullName: string; number: number; title: string; url: string; updatedAt: string;
}
// discord/handlers.ts
export interface AttentionList { incoming: PrSummary[]; mine: PrSummary[]; }
export interface StatusDeps { listAttention(user: User): Promise<AttentionList>; }
```

---

### Task 1: `github/search.ts` — Search API client

**Files:**
- Create: `src/github/search.ts`
- Test: `src/github/search.test.ts`

- [ ] **Step 1: Write the failing test** (`src/github/search.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import {
  searchPullRequests,
  QUERY_AWAITING_MY_REVIEW,
  QUERY_MY_PRS_AWAITING_REVIEW,
} from "./search";
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

describe("query constants", () => {
  it("are the expected search strings", () => {
    expect(QUERY_AWAITING_MY_REVIEW).toBe("is:open is:pr review-requested:@me");
    expect(QUERY_MY_PRS_AWAITING_REVIEW).toBe(
      "is:open is:pr author:@me draft:false review:required"
    );
  });
});

describe("searchPullRequests", () => {
  it("maps items to PrSummary, deriving repo and url", async () => {
    const body = {
      items: [
        {
          number: 42,
          title: "Fix bug",
          html_url: "https://github.com/acme/repo/pull/42",
          updated_at: "2026-06-17T10:00:00Z",
          repository_url: "https://api.github.com/repos/acme/repo",
        },
      ],
    };
    const res = await searchPullRequests("tok", "q", fakeFetch(200, body));
    expect(res).toEqual([
      {
        repoFullName: "acme/repo",
        number: 42,
        title: "Fix bug",
        url: "https://github.com/acme/repo/pull/42",
        updatedAt: "2026-06-17T10:00:00Z",
      },
    ]);
  });

  it("returns [] when there are no items", async () => {
    expect(await searchPullRequests("tok", "q", fakeFetch(200, { items: [] }))).toEqual([]);
  });

  it("throws an error carrying the status on non-2xx", async () => {
    await expect(searchPullRequests("tok", "q", fakeFetch(401, {}))).rejects.toMatchObject({
      status: 401,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/github/search.test.ts`
Expected: FAIL — cannot find module `./search`.

- [ ] **Step 3: Write minimal implementation** (`src/github/search.ts`)

```ts
import { type FetchLike, defaultFetch } from "./http";

export interface PrSummary {
  repoFullName: string;
  number: number;
  title: string;
  url: string;
  updatedAt: string;
}

export const QUERY_AWAITING_MY_REVIEW = "is:open is:pr review-requested:@me";
export const QUERY_MY_PRS_AWAITING_REVIEW =
  "is:open is:pr author:@me draft:false review:required";

interface RawSearchItem {
  number: number;
  title: string;
  html_url: string;
  updated_at: string;
  repository_url: string;
}

export async function searchPullRequests(
  token: string,
  query: string,
  fetchImpl: FetchLike = defaultFetch
): Promise<PrSummary[]> {
  const url =
    "https://api.github.com/search/issues?q=" +
    encodeURIComponent(query) +
    "&sort=updated&order=desc&per_page=30";
  const res = await fetchImpl(url, {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    throw Object.assign(new Error(`GitHub search failed: ${res.status}`), { status: res.status });
  }
  const body = (await res.json()) as { items?: RawSearchItem[] };
  return (body.items ?? []).map((it) => ({
    repoFullName: it.repository_url.replace("https://api.github.com/repos/", ""),
    number: it.number,
    title: it.title,
    url: it.html_url,
    updatedAt: it.updated_at,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/github/search.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck` → exit 0.

```bash
git add src/github/search.ts src/github/search.test.ts
git commit -m "feat: add github PR search client"
```

---

### Task 2: Wire the attention list into `/status`

This task changes `handleStatus`'s signature (adds `StatusDeps`), so the discord
adapter and composition root must change with it. Build + full suite go green at
the end.

**Files:**
- Modify: `src/discord/handlers.ts` (replace the whole file)
- Modify: `src/discord/handlers.test.ts` (replace the whole file)
- Modify: `src/discord/client.ts` (replace the whole file)
- Modify: `src/index.ts` (targeted edits)

- [ ] **Step 1: Rewrite `src/discord/handlers.ts`** (replace the entire file)

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
const MAX_TITLE = 70;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function renderSection(label: string, prs: PrSummary[], emptyLine: string): string {
  if (prs.length === 0) return `${label}\n${emptyLine}`;
  const lines = prs
    .slice(0, MAX_PER_SECTION)
    .map((p) => `• [${p.repoFullName} #${p.number} ${truncate(p.title, MAX_TITLE)}](${p.url})`)
    .join("\n");
  const more = prs.length > MAX_PER_SECTION ? `\n…and ${prs.length - MAX_PER_SECTION} more` : "";
  return `${label} (${prs.length})\n${lines}${more}`;
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
  await ctx.reply(`${header}\n\n${incoming}\n\n${mine}`);
}
```

- [ ] **Step 2: Rewrite `src/discord/handlers.test.ts`** (replace the entire file)

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

function pr(n: number, title = "Title"): PrSummary {
  return {
    repoFullName: "acme/repo",
    number: n,
    title,
    url: `https://github.com/acme/repo/pull/${n}`,
    updatedAt: "2026-06-17T10:00:00Z",
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

  it("shows the login and both sections with items", async () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    await handleStatus(
      ctx(),
      db,
      statusDeps({ incoming: [pr(7, "Fix bug")], mine: [pr(9, "My feature")] })
    );
    const msg = replies[0];
    expect(msg).toContain("octocat");
    expect(msg).toContain("Awaiting your review");
    expect(msg).toContain("[acme/repo #7 Fix bug](https://github.com/acme/repo/pull/7)");
    expect(msg).toContain("Your PRs awaiting review");
    expect(msg).toContain("[acme/repo #9 My feature](https://github.com/acme/repo/pull/9)");
  });

  it("shows friendly empty-state lines when sections are empty", async () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    await handleStatus(ctx(), db, statusDeps({ incoming: [], mine: [] }));
    expect(replies[0]).toMatch(/Nothing awaiting your review/i);
    expect(replies[0]).toMatch(/No open PRs of yours/i);
  });

  it("caps a section at 10 and notes the remainder", async () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    const many = Array.from({ length: 13 }, (_, i) => pr(i + 1));
    await handleStatus(ctx(), db, statusDeps({ incoming: many, mine: [] }));
    const itemLines = replies[0].split("\n").filter((l) => l.startsWith("• "));
    expect(itemLines).toHaveLength(10);
    expect(replies[0]).toContain("…and 3 more");
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

- [ ] **Step 3: Run the handler tests**

Run: `npx vitest run src/discord/handlers.test.ts`
Expected: PASS (8 tests). (The implementation in Step 1 already satisfies them.)

- [ ] **Step 4: Rewrite `src/discord/client.ts`** (replace the entire file — `startDiscord` gains `statusDeps`, `/status` defers, `ctx.reply` is defer-aware)

```ts
import {
  Client,
  GatewayIntentBits,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Database } from "../db";
import type { DmSender } from "../notifier";
import {
  handleLink,
  handleUnlink,
  handleStatus,
  type CommandContext,
  type LinkDeps,
  type StatusDeps,
} from "./handlers";

function toContext(interaction: ChatInputCommandInteraction): CommandContext {
  return {
    userId: interaction.user.id,
    guildId: interaction.guildId,
    getOption: (name) => interaction.options.getString(name),
    reply: async (message) => {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: message });
      } else {
        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
      }
    },
  };
}

export interface DiscordRuntime {
  client: Client;
  sender: DmSender;
}

export async function startDiscord(
  token: string,
  db: Database,
  linkDeps: LinkDeps,
  statusDeps: StatusDeps
): Promise<DiscordRuntime> {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const ctx = toContext(interaction);
    try {
      if (interaction.commandName === "link") {
        await handleLink(ctx, db, linkDeps);
      } else if (interaction.commandName === "unlink") {
        await handleUnlink(ctx, db);
      } else if (interaction.commandName === "status") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await handleStatus(ctx, db, statusDeps);
      }
    } catch (err) {
      console.error("Command handler error:", err);
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: "Something went wrong.", flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: "Something went wrong.", flags: MessageFlags.Ephemeral });
        }
      } catch (replyErr) {
        console.error("Failed to send error reply:", replyErr);
      }
    }
  });

  const sender: DmSender = {
    async sendDm(discordId, message) {
      const user = await client.users.fetch(discordId);
      await user.send(message);
    },
  };

  await client.login(token);
  return { client, sender };
}
```

- [ ] **Step 5: Edit `src/index.ts`** — add the search import, build `statusDeps`, and pass it to `startDiscord`.

Add to the imports (next to the other `./github/...` imports):

```ts
import {
  searchPullRequests,
  QUERY_AWAITING_MY_REVIEW,
  QUERY_MY_PRS_AWAITING_REVIEW,
} from "./github/search";
```

Replace this line:

```ts
  const { client, sender } = await startDiscord(config.discordToken, db, linkDeps);
```

with:

```ts
  const statusDeps = {
    listAttention: async (user: import("./db").User) => {
      const token = decrypt(
        { ciphertext: user.tokenCiphertext, iv: user.tokenIv, tag: user.tokenTag },
        config.tokenEncryptionKey
      );
      const [incoming, mine] = await Promise.all([
        searchPullRequests(token, QUERY_AWAITING_MY_REVIEW),
        searchPullRequests(token, QUERY_MY_PRS_AWAITING_REVIEW),
      ]);
      return { incoming, mine };
    },
  };

  const { client, sender } = await startDiscord(config.discordToken, db, linkDeps, statusDeps);
```

- [ ] **Step 6: Verify build and full suite**

Run: `npm run build` → exit 0 (no TypeScript errors).
Run: `npm test` → all suites pass (crypto, config, github/oauth, github/notifications, github/search, db, notifier, poller, http/routes, discord/handlers, discord/commands — expect 11 suites).

- [ ] **Step 7: Commit**

```bash
git add src/discord/handlers.ts src/discord/handlers.test.ts src/discord/client.ts src/index.ts
git commit -m "feat: /status lists PRs awaiting your review and your PRs awaiting review"
```

---

## Self-Review Notes

- **Spec coverage:** Search client + exported query constants (Task 1); two sections with no time window, 10-cap + "…and N more" + title truncation + masked links + empty-state lines (Task 2, `handleStatus`/`renderSection`); `/status` defers the ephemeral reply, defer-aware `ctx.reply` (Task 2, `client.ts`); 401 → reconnect / other → retry, never throws, no user-row deletion (Task 2, `handleStatus`); `listAttention` wired from decrypt + two searches (Task 2, `index.ts`); tests for search parsing, query constants, all `/status` branches. Not-connected path unchanged. All spec sections map to a task.
- **Type consistency:** `PrSummary` (search.ts) imported by handlers + index; `StatusDeps`/`AttentionList` (handlers.ts) imported by client; `startDiscord(token, db, linkDeps, statusDeps)` matches its `index.ts` call; `searchPullRequests(token, query, fetchImpl?)` matches its `index.ts` calls; the 401 path keys on an error `.status` property, which `searchPullRequests` attaches via `Object.assign`.
- **Green-at-each-commit:** Task 1 is a new additive file (suite stays green). Task 2 changes the coupled handler/adapter/root together and restores a green build + full suite at Step 6.
- **No placeholders:** every step has complete code and exact commands.
