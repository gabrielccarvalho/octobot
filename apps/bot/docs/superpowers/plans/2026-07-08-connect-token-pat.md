# `/connect-token` (PAT connection) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a supplementary `/connect-token` Discord command that lets a user connect with a classic GitHub Personal Access Token, bypassing OAuth App org-approval restrictions.

**Architecture:** A PAT is a bearer token identical to the OAuth token downstream, so the DB, encryption, poller, digest, and onboarding are all reused unchanged. The only new logic is (1) validating a pasted token and its scopes, (2) storing an `auth_source` marker, and (3) making 401 "reconnect" messaging source-aware. Discord entry uses a secure message → button → modal flow so the secret never appears in a channel.

**Tech Stack:** TypeScript, discord.js v14, better-sqlite3, Fastify, vitest.

## Global Constraints

- Token-creation URL must be exactly: `https://github.com/settings/tokens/new?scopes=repo,notifications&description=discord-pr-bot`
- Required PAT scopes: `repo` **and** `notifications`. Reject tokens missing either.
- All Discord replies for this feature are ephemeral (`MessageFlags.Ephemeral`).
- The token is only ever collected via a Discord **modal** — never as a slash-command string option (that would leak it into the channel).
- `auth_source` values are the exact strings `'oauth'` and `'pat'`. Existing rows default to `'oauth'`.
- Never log or echo the raw token.
- Follow the existing dependency-injection pattern: pure logic lives in `handlers.ts`/`oauth.ts` with deps passed in; discord.js component construction lives in `client.ts`.

---

### Task 1: Add `auth_source` to the database layer

**Files:**
- Modify: `src/db.ts` (User interface ~4-12, migration block ~61-66, `upsertUser` ~75-88, `getUser` ~90-117, `getAllUsers` ~119-142)
- Test: `src/db.test.ts`

**Interfaces:**
- Produces:
  - `User.authSource: string` (new field on the existing `User` interface)
  - `upsertUser(discordId: string, githubLogin: string, enc: { ciphertext: string; iv: string; tag: string }, authSource?: string): void` — new optional 4th param, defaults to `'oauth'`
  - `getUser`/`getAllUsers` now populate `authSource`

- [ ] **Step 1: Write the failing tests**

Add to `src/db.test.ts` (match the existing test style — a temp DB per test via `createDatabase(":memory:")` or the file pattern already used in that file; reuse whatever helper exists there):

```typescript
import { describe, it, expect } from "vitest";
import { createDatabase } from "./db";

const enc = { ciphertext: "c", iv: "i", tag: "t" };

describe("auth_source", () => {
  it("defaults to 'oauth' when upsertUser omits it", () => {
    const db = createDatabase(":memory:");
    db.upsertUser("d1", "octocat", enc);
    expect(db.getUser("d1")?.authSource).toBe("oauth");
    db.close();
  });

  it("stores 'pat' when passed", () => {
    const db = createDatabase(":memory:");
    db.upsertUser("d2", "octocat", enc, "pat");
    expect(db.getUser("d2")?.authSource).toBe("pat");
    db.close();
  });

  it("exposes authSource through getAllUsers", () => {
    const db = createDatabase(":memory:");
    db.upsertUser("d3", "octocat", enc, "pat");
    expect(db.getAllUsers().find((u) => u.discordId === "d3")?.authSource).toBe("pat");
    db.close();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/db.test.ts`
Expected: FAIL — `authSource` is `undefined` (property does not exist yet).

- [ ] **Step 3: Add the field to the `User` interface**

In `src/db.ts`, add to the `User` interface (after `createdAt` on line ~11):

```typescript
export interface User {
  discordId: string;
  githubLogin: string;
  tokenCiphertext: string;
  tokenIv: string;
  tokenTag: string;
  lastModified: string | null;
  createdAt: string;
  authSource: string;
}
```

- [ ] **Step 4: Add the idempotent migration**

In `src/db.ts`, in the migration block (right after the `digest_enabled` line ~66), add:

```typescript
if (!hasCol("auth_source")) sql.exec("ALTER TABLE users ADD COLUMN auth_source TEXT NOT NULL DEFAULT 'oauth'");
```

- [ ] **Step 5: Update `upsertUser` to accept and write `auth_source`**

Change the interface signature (line ~15) to:

```typescript
upsertUser(discordId: string, githubLogin: string, enc: { ciphertext: string; iv: string; tag: string }, authSource?: string): void;
```

Change the implementation (lines ~75-88) to:

```typescript
    upsertUser(discordId, githubLogin, enc, authSource = "oauth"): void {
      sql
        .prepare(
          `INSERT INTO users (discord_id, github_login, token_ciphertext, token_iv, token_tag, auth_source, last_modified, created_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
           ON CONFLICT(discord_id) DO UPDATE SET
             github_login = excluded.github_login,
             token_ciphertext = excluded.token_ciphertext,
             token_iv = excluded.token_iv,
             token_tag = excluded.token_tag,
             auth_source = excluded.auth_source,
             last_modified = NULL`
        )
        .run(discordId, githubLogin, enc.ciphertext, enc.iv, enc.tag, authSource, new Date().toISOString());
    },
```

- [ ] **Step 6: Update `getUser` to select and map `auth_source`**

In `getUser` (lines ~90-117): add `auth_source` to the SELECT column list, add `auth_source: string;` to the row type, and add `authSource: r.auth_source,` to the returned object:

```typescript
    getUser(discordId): User | null {
      const r = sql
        .prepare(
          "SELECT discord_id, github_login, token_ciphertext, token_iv, token_tag, auth_source, last_modified, created_at FROM users WHERE discord_id = ?"
        )
        .get(discordId) as
        | {
            discord_id: string;
            github_login: string;
            token_ciphertext: string;
            token_iv: string;
            token_tag: string;
            auth_source: string;
            last_modified: string | null;
            created_at: string;
          }
        | undefined;
      return r
        ? {
            discordId: r.discord_id,
            githubLogin: r.github_login,
            tokenCiphertext: r.token_ciphertext,
            tokenIv: r.token_iv,
            tokenTag: r.token_tag,
            authSource: r.auth_source,
            lastModified: r.last_modified,
            createdAt: r.created_at,
          }
        : null;
    },
```

- [ ] **Step 7: Update `getAllUsers` the same way**

In `getAllUsers` (lines ~119-142): add `auth_source` to the SELECT, to the row type, and `authSource: r.auth_source,` to each mapped object:

```typescript
    getAllUsers(): User[] {
      const rows = sql
        .prepare(
          "SELECT discord_id, github_login, token_ciphertext, token_iv, token_tag, auth_source, last_modified, created_at FROM users"
        )
        .all() as {
        discord_id: string;
        github_login: string;
        token_ciphertext: string;
        token_iv: string;
        token_tag: string;
        auth_source: string;
        last_modified: string | null;
        created_at: string;
      }[];
      return rows.map((r) => ({
        discordId: r.discord_id,
        githubLogin: r.github_login,
        tokenCiphertext: r.token_ciphertext,
        tokenIv: r.token_iv,
        tokenTag: r.token_tag,
        authSource: r.auth_source,
        lastModified: r.last_modified,
        createdAt: r.created_at,
      }));
    },
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/db.test.ts`
Expected: PASS (new tests + all pre-existing db tests still green).

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors. (Any test file that constructs a `User` literal will now need `authSource` — fix those in place if the compiler flags them.)

- [ ] **Step 10: Commit**

```bash
git add src/db.ts src/db.test.ts
git commit -m "feat(db): add auth_source column to users"
```

---

### Task 2: Add `validateToken` to the GitHub OAuth module

**Files:**
- Modify: `src/github/oauth.ts` (add new export after `fetchViewerLogin`, ~line 49)
- Test: `src/github/oauth.test.ts`

**Interfaces:**
- Consumes: `FetchLike`, `defaultFetch` from `./http` (already imported in the file).
- Produces: `validateToken(token: string, fetchImpl?: FetchLike): Promise<{ login: string; scopes: string[] }>` — resolves with the account login and the token's granted scopes; throws `Error` with a `.status` number property on a non-OK response.

- [ ] **Step 1: Write the failing tests**

The existing `fakeFetch` helper in `src/github/oauth.test.ts` hardcodes `headers: { get: () => null }`. Add a scope-aware fake alongside it and the tests:

```typescript
import { validateToken } from "./oauth";

function fakeFetchWithHeaders(handler: (url: string, init?: any) => any): FetchLike {
  return async (url, init) => {
    const r = handler(url, init);
    return {
      status: r.status ?? 200,
      ok: (r.status ?? 200) < 400,
      headers: { get: (name: string) => (r.headers ? r.headers[name.toLowerCase()] ?? null : null) },
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
    };
  };
}

describe("validateToken", () => {
  it("returns login and parsed scopes on success", async () => {
    const fetchImpl = fakeFetchWithHeaders(() => ({
      status: 200,
      body: { login: "octocat" },
      headers: { "x-oauth-scopes": "repo, notifications, read:org" },
    }));
    const result = await validateToken("ghp_x", fetchImpl);
    expect(result.login).toBe("octocat");
    expect(result.scopes).toEqual(["repo", "notifications", "read:org"]);
  });

  it("returns an empty scopes array when the header is absent", async () => {
    const fetchImpl = fakeFetchWithHeaders(() => ({ status: 200, body: { login: "octocat" } }));
    const result = await validateToken("ghp_x", fetchImpl);
    expect(result.scopes).toEqual([]);
  });

  it("throws with a status property on 401", async () => {
    const fetchImpl = fakeFetchWithHeaders(() => ({ status: 401, body: {} }));
    await expect(validateToken("bad", fetchImpl)).rejects.toMatchObject({ status: 401 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/github/oauth.test.ts`
Expected: FAIL — `validateToken` is not exported.

- [ ] **Step 3: Implement `validateToken`**

Append to `src/github/oauth.ts` (after `fetchViewerLogin`):

```typescript
export async function validateToken(
  token: string,
  fetchImpl: FetchLike = defaultFetch
): Promise<{ login: string; scopes: string[] }> {
  const res = await fetchImpl("https://api.github.com/user", {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    const err = new Error(`Token validation failed: ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const data = (await res.json()) as { login?: string };
  if (!data.login) throw new Error("GitHub user response missing login");
  const raw = res.headers.get("x-oauth-scopes");
  const scopes = raw
    ? raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : [];
  return { login: data.login, scopes };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/github/oauth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/github/oauth.ts src/github/oauth.test.ts
git commit -m "feat(github): add validateToken with scope parsing"
```

---

### Task 3: Add source-aware reconnect messaging

**Files:**
- Modify: `src/status.ts` (add `reconnectHint` export)
- Modify: `src/discord/handlers.ts` (`handleStatus` 401 branch ~100-107)
- Modify: `src/poller.ts` (401 branch ~28-39)
- Test: `src/status.test.ts`, `src/discord/handlers.test.ts`

**Interfaces:**
- Produces: `reconnectHint(authSource: string): string` from `src/status.ts` — returns a full capitalized sentence telling the user how to reconnect based on their auth source.

- [ ] **Step 1: Write the failing test for `reconnectHint`**

Add to `src/status.test.ts`:

```typescript
import { reconnectHint } from "./status";

describe("reconnectHint", () => {
  it("points oauth users at /link", () => {
    expect(reconnectHint("oauth")).toBe("Run `/link` to reconnect.");
  });

  it("points pat users at /connect-token", () => {
    expect(reconnectHint("pat")).toBe("Run `/connect-token` with a fresh token to reconnect.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/status.test.ts`
Expected: FAIL — `reconnectHint` is not exported.

- [ ] **Step 3: Implement `reconnectHint`**

Add to `src/status.ts` (top-level export):

```typescript
export function reconnectHint(authSource: string): string {
  return authSource === "pat"
    ? "Run `/connect-token` with a fresh token to reconnect."
    : "Run `/link` to reconnect.";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/status.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire `reconnectHint` into `handleStatus`**

In `src/discord/handlers.ts`, add to the imports from `../status` (line 2 currently imports `formatAttention`, `type AttentionList`):

```typescript
import { formatAttention, reconnectHint, type AttentionList } from "../status";
```

Replace the 401 note logic in `handleStatus` (lines ~100-107) with:

```typescript
  } catch (err) {
    const status = (err as { status?: number }).status;
    const note =
      status === 401
        ? `Your GitHub connection expired. ${reconnectHint(user.authSource)}`
        : "Couldn't reach GitHub right now — try again in a moment.";
    await ctx.reply(`✅ Connected as \`${user.githubLogin}\`\n\n${note}`);
  }
```

- [ ] **Step 6: Update the handlers test for the new copy**

Find the existing `handleStatus` 401 test in `src/discord/handlers.test.ts`. It asserts the old "run `/link`" copy. Update the assertion so an oauth user still sees `/link` and add a pat case. If the test builds a `User`, remember it now needs `authSource`. Example additions/edits:

```typescript
it("tells an oauth user to run /link on 401", async () => {
  const user = { discordId: "d1", githubLogin: "octocat", tokenCiphertext: "c", tokenIv: "i", tokenTag: "t", lastModified: null, createdAt: "now", authSource: "oauth" };
  const db = { getUser: () => user } as any;
  const deps = { listAttention: async () => { throw { status: 401 }; } };
  let out = "";
  const ctx = { userId: "d1", guildId: null, getOption: () => null, reply: async (m: string) => { out = m; } };
  await handleStatus(ctx as any, db, deps as any);
  expect(out).toContain("/link");
});

it("tells a pat user to run /connect-token on 401", async () => {
  const user = { discordId: "d1", githubLogin: "octocat", tokenCiphertext: "c", tokenIv: "i", tokenTag: "t", lastModified: null, createdAt: "now", authSource: "pat" };
  const db = { getUser: () => user } as any;
  const deps = { listAttention: async () => { throw { status: 401 }; } };
  let out = "";
  const ctx = { userId: "d1", guildId: null, getOption: () => null, reply: async (m: string) => { out = m; } };
  await handleStatus(ctx as any, db, deps as any);
  expect(out).toContain("/connect-token");
});
```

(Adapt to the exact mock shape already used in that file — reuse its existing helpers rather than the inline objects above if they exist.)

- [ ] **Step 7: Wire `reconnectHint` into the poller**

In `src/poller.ts`, add the import at the top (alongside its other imports):

```typescript
import { reconnectHint } from "./status";
```

Replace the DM string in the 401 branch (lines ~28-39) so it is source-aware:

```typescript
  if (res.status === 401) {
    try {
      await deps.sender.sendDm(
        user.discordId,
        `⚠️ Your GitHub connection expired or was revoked. ${reconnectHint(user.authSource)}`
      );
    } catch (err) {
      console.warn(`Failed to DM revocation notice to ${user.discordId}:`, err);
    }
    deps.db.deleteUser(user.discordId);
    return;
  }
```

- [ ] **Step 8: Run the full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, no type errors. If any poller test builds a `User`, add `authSource` to it.

- [ ] **Step 9: Commit**

```bash
git add src/status.ts src/status.test.ts src/discord/handlers.ts src/discord/handlers.test.ts src/poller.ts
git commit -m "feat: source-aware reconnect hint for oauth vs pat"
```

---

### Task 4: Add the `handleTokenSubmit` logic and Discord constants

**Files:**
- Modify: `src/discord/handlers.ts` (add constants + `TokenDeps` + `handleTokenSubmit`)
- Test: `src/discord/handlers.test.ts`

**Interfaces:**
- Consumes: `Database`, `User` from `../db`; `validateToken` result shape `{ login: string; scopes: string[] }`; `Encrypted` from `../crypto`.
- Produces (all exported from `src/discord/handlers.ts`):
  - `CONNECT_TOKEN_CREATE_URL: string`
  - `CONNECT_TOKEN_PASTE_ID = "connect-token:paste"`
  - `CONNECT_TOKEN_MODAL_ID = "connect-token:modal"`
  - `CONNECT_TOKEN_INPUT_ID = "connect-token:input"`
  - `CONNECT_TOKEN_MESSAGE: string` (the instruction copy shown with the buttons)
  - `interface TokenDeps { validateToken(token: string): Promise<{ login: string; scopes: string[] }>; encrypt(token: string): { ciphertext: string; iv: string; tag: string }; onConnect(discordId: string, token: string, githubLogin: string): Promise<void>; }`
  - `handleTokenSubmit(userId: string, rawToken: string, db: Database, deps: TokenDeps): Promise<string>` — validates, stores on success (`authSource = 'pat'`), best-effort onboarding, and returns the user-facing reply string.

- [ ] **Step 1: Write the failing tests**

Add to `src/discord/handlers.test.ts`:

```typescript
import { handleTokenSubmit, CONNECT_TOKEN_CREATE_URL } from "./handlers";

function tokenDb() {
  const calls: any = { upsert: null };
  const db = {
    upsertUser: (discordId: string, login: string, enc: any, authSource?: string) => {
      calls.upsert = { discordId, login, enc, authSource };
    },
  } as any;
  return { db, calls };
}

const okDeps = (overrides: any = {}) => ({
  validateToken: async () => ({ login: "octocat", scopes: ["repo", "notifications"] }),
  encrypt: () => ({ ciphertext: "c", iv: "i", tag: "t" }),
  onConnect: async () => {},
  ...overrides,
});

describe("handleTokenSubmit", () => {
  it("stores the token as pat and confirms on success", async () => {
    const { db, calls } = tokenDb();
    const out = await handleTokenSubmit("d1", "  ghp_valid  ", db, okDeps() as any);
    expect(calls.upsert.authSource).toBe("pat");
    expect(calls.upsert.login).toBe("octocat");
    expect(out).toContain("octocat");
  });

  it("rejects an invalid token (401) without storing", async () => {
    const { db, calls } = tokenDb();
    const deps = okDeps({ validateToken: async () => { throw Object.assign(new Error("x"), { status: 401 }); } });
    const out = await handleTokenSubmit("d1", "bad", db, deps as any);
    expect(calls.upsert).toBeNull();
    expect(out.toLowerCase()).toContain("invalid");
  });

  it("rejects a token missing the repo scope, naming it", async () => {
    const { db, calls } = tokenDb();
    const deps = okDeps({ validateToken: async () => ({ login: "octocat", scopes: ["notifications"] }) });
    const out = await handleTokenSubmit("d1", "ghp_x", db, deps as any);
    expect(calls.upsert).toBeNull();
    expect(out).toContain("repo");
  });

  it("rejects a token missing the notifications scope, naming it", async () => {
    const { db, calls } = tokenDb();
    const deps = okDeps({ validateToken: async () => ({ login: "octocat", scopes: ["repo"] }) });
    const out = await handleTokenSubmit("d1", "ghp_x", db, deps as any);
    expect(calls.upsert).toBeNull();
    expect(out).toContain("notifications");
  });

  it("still confirms success when onboarding throws", async () => {
    const { db } = tokenDb();
    const deps = okDeps({ onConnect: async () => { throw new Error("network"); } });
    const out = await handleTokenSubmit("d1", "ghp_x", db, deps as any);
    expect(out).toContain("octocat");
  });

  it("exposes the exact pre-filled token URL", () => {
    expect(CONNECT_TOKEN_CREATE_URL).toBe(
      "https://github.com/settings/tokens/new?scopes=repo,notifications&description=discord-pr-bot"
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/discord/handlers.test.ts`
Expected: FAIL — `handleTokenSubmit` / `CONNECT_TOKEN_CREATE_URL` not exported.

- [ ] **Step 3: Add constants and `TokenDeps` to `handlers.ts`**

Near the top of `src/discord/handlers.ts` (after the existing `LISTEN_TO_*` / `DIGEST_*` constants), add:

```typescript
export const CONNECT_TOKEN_CREATE_URL =
  "https://github.com/settings/tokens/new?scopes=repo,notifications&description=discord-pr-bot";
export const CONNECT_TOKEN_PASTE_ID = "connect-token:paste";
export const CONNECT_TOKEN_MODAL_ID = "connect-token:modal";
export const CONNECT_TOKEN_INPUT_ID = "connect-token:input";

export const CONNECT_TOKEN_MESSAGE =
  "🔑 **Connect with a Personal Access Token** (works even when your org restricts OAuth apps).\n\n" +
  "1. Click **Create token on GitHub** below — the scopes (`repo`, `notifications`) are pre-selected.\n" +
  "2. Pick an expiration, click **Generate token**, and copy it.\n" +
  "3. Click **Paste my token** and paste it in. Your token is stored encrypted and never shown in this channel.";

export interface TokenDeps {
  validateToken(token: string): Promise<{ login: string; scopes: string[] }>;
  encrypt(token: string): { ciphertext: string; iv: string; tag: string };
  onConnect(discordId: string, token: string, githubLogin: string): Promise<void>;
}

const REQUIRED_PAT_SCOPES = ["repo", "notifications"] as const;
```

- [ ] **Step 4: Implement `handleTokenSubmit`**

Add to `src/discord/handlers.ts` (below the other handlers):

```typescript
export async function handleTokenSubmit(
  userId: string,
  rawToken: string,
  db: Database,
  deps: TokenDeps
): Promise<string> {
  const token = rawToken.trim();
  if (!token) return "No token received. Run `/connect-token` and paste your token to try again.";

  let result: { login: string; scopes: string[] };
  try {
    result = await deps.validateToken(token);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) {
      return "That token is invalid or expired — create a new one and try again.";
    }
    return "Couldn't reach GitHub to verify that token — try again in a moment.";
  }

  const missing = REQUIRED_PAT_SCOPES.filter((s) => !result.scopes.includes(s));
  if (missing.length > 0) {
    return (
      `That token is missing the \`${missing.join("` and `")}\` scope` +
      `${missing.length > 1 ? "s" : ""}. Regenerate it with \`repo\` and \`notifications\` checked, then run \`/connect-token\` again.`
    );
  }

  db.upsertUser(userId, result.login, deps.encrypt(token), "pat");
  try {
    await deps.onConnect(userId, token, result.login);
  } catch (err) {
    console.warn(`Onboarding after /connect-token failed for ${userId}:`, err);
  }
  return `✅ Connected as \`${result.login}\` via personal access token.`;
}
```

Note: `Database` is already imported at the top of `handlers.ts` (`import type { Database, User } from "../db";`). No new import needed.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/discord/handlers.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/discord/handlers.ts src/discord/handlers.test.ts
git commit -m "feat(discord): add handleTokenSubmit PAT validation logic"
```

---

### Task 5: Register the command and wire the Discord modal flow

**Files:**
- Modify: `src/discord/commands.ts` (add `/connect-token`)
- Modify: `src/discord/client.ts` (button → modal, modal-submit handler, pass `tokenDeps`)
- Modify: `src/index.ts` (build and inject `tokenDeps`)
- Test: `src/discord/commands.test.ts`

**Interfaces:**
- Consumes: `TokenDeps`, `handleTokenSubmit`, `CONNECT_TOKEN_CREATE_URL`, `CONNECT_TOKEN_MESSAGE`, `CONNECT_TOKEN_PASTE_ID`, `CONNECT_TOKEN_MODAL_ID`, `CONNECT_TOKEN_INPUT_ID` from `./handlers`; `validateToken` from `../github/oauth`; `createOnConnect` result and `encrypt` from existing `index.ts` wiring.
- Produces: `startDiscord(...)` gains a 6th parameter `tokenDeps: TokenDeps`.

- [ ] **Step 1: Write the failing test for command registration**

Add to `src/discord/commands.test.ts` (match the existing assertions that check command names):

```typescript
it("registers the connect-token command", () => {
  const names = commands.map((c: any) => c.name);
  expect(names).toContain("connect-token");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/discord/commands.test.ts`
Expected: FAIL — `connect-token` not in the list.

- [ ] **Step 3: Register the command**

In `src/discord/commands.ts`, add to the `commands` array:

```typescript
  new SlashCommandBuilder()
    .setName("connect-token")
    .setDescription("Connect with a GitHub token (for orgs that restrict OAuth apps)")
    .toJSON(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/discord/commands.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the `tokenDeps` parameter and imports to `client.ts`**

In `src/discord/client.ts`, extend the discord.js import block to add the modal + text-input builders and the modal-submit type:

```typescript
import {
  Client,
  GatewayIntentBits,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
```

Extend the imports from `./handlers` to include the new symbols:

```typescript
  handleTokenSubmit,
  CONNECT_TOKEN_CREATE_URL,
  CONNECT_TOKEN_MESSAGE,
  CONNECT_TOKEN_PASTE_ID,
  CONNECT_TOKEN_MODAL_ID,
  CONNECT_TOKEN_INPUT_ID,
  type TokenDeps,
```

Add `tokenDeps` as the final parameter of `startDiscord`:

```typescript
export async function startDiscord(
  token: string,
  db: Database,
  linkDeps: LinkDeps,
  statusDeps: StatusDeps,
  digestDeps: DigestDeps,
  tokenDeps: TokenDeps
): Promise<DiscordRuntime> {
```

- [ ] **Step 6: Build the connect-token components and modal handlers in `client.ts`**

Inside `startDiscord`, after the `digestButtons` definition, add:

```typescript
  const connectTokenComponents = () => [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("Create token on GitHub")
        .setStyle(ButtonStyle.Link)
        .setURL(CONNECT_TOKEN_CREATE_URL),
      new ButtonBuilder()
        .setCustomId(CONNECT_TOKEN_PASTE_ID)
        .setLabel("Paste my token")
        .setStyle(ButtonStyle.Primary)
    ),
  ];

  const tokenModal = () =>
    new ModalBuilder()
      .setCustomId(CONNECT_TOKEN_MODAL_ID)
      .setTitle("Connect with a GitHub token")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(CONNECT_TOKEN_INPUT_ID)
            .setLabel("Paste your personal access token")
            .setPlaceholder("ghp_…")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

  const handleTokenModal = async (interaction: ModalSubmitInteraction) => {
    if (interaction.customId !== CONNECT_TOKEN_MODAL_ID) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const raw = interaction.fields.getTextInputValue(CONNECT_TOKEN_INPUT_ID);
    const message = await handleTokenSubmit(interaction.user.id, raw, db, tokenDeps);
    await interaction.editReply({ content: message });
  };
```

- [ ] **Step 7: Route the paste button and the modal submission**

In the `client.on("interactionCreate", …)` handler:

Add a modal-submit branch at the very top of the callback (before the `isButton` check):

```typescript
    if (interaction.isModalSubmit()) {
      try {
        await handleTokenModal(interaction);
      } catch (err) {
        console.error("Modal submit handler error:", err);
      }
      return;
    }
```

Extend the existing `isButton()` branch so the paste button opens the modal instead of going to the digest handler. Replace the current button block:

```typescript
    if (interaction.isButton()) {
      try {
        if (interaction.customId === CONNECT_TOKEN_PASTE_ID) {
          await interaction.showModal(tokenModal());
        } else {
          await handleDigestButton(interaction);
        }
      } catch (err) {
        console.error("Button handler error:", err);
      }
      return;
    }
```

- [ ] **Step 8: Add the `/connect-token` command branch**

In the chat-input command dispatch (the `if (interaction.commandName === …)` chain), add a branch (e.g. after the `link` branch):

```typescript
      } else if (interaction.commandName === "connect-token") {
        await interaction.reply({
          content: CONNECT_TOKEN_MESSAGE,
          components: connectTokenComponents(),
          flags: MessageFlags.Ephemeral,
        });
```

- [ ] **Step 9: Build and inject `tokenDeps` in `index.ts`**

In `src/index.ts`:

Add `validateToken` to the oauth import (line 8):

```typescript
import { buildAuthorizeUrl, exchangeCode, fetchViewerLogin, validateToken } from "./github/oauth";
```

Because `tokenDeps.onConnect` needs the `onConnect` created after `startDiscord` (which needs the `sender`), use the same mutable-deps pattern already used for `digestDeps.sender`. Declare `tokenDeps` before `startDiscord` with a placeholder, pass it in, then assign `onConnect` after it exists.

Before the `startDiscord` call (near where `linkDeps`/`digestDeps` are defined), add:

```typescript
  const tokenDeps: import("./discord/handlers").TokenDeps = {
    validateToken: (token) => validateToken(token),
    encrypt: (token) => encrypt(token, config.tokenEncryptionKey),
    onConnect: undefined as never, // set after onConnect is created below
  };
```

Update the `startDiscord` call to pass it:

```typescript
  const { client, sender } = await startDiscord(
    config.discordToken,
    db,
    linkDeps,
    statusDeps,
    digestDeps,
    tokenDeps
  );
  digestDeps.sender = sender;
```

After `const onConnect = createOnConnect({ … })` is defined, add:

```typescript
  tokenDeps.onConnect = onConnect;
```

- [ ] **Step 10: Run full suite + typecheck + build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: All tests PASS, no type errors, build succeeds. (`npm run build` per package.json compiles to `dist/`.)

- [ ] **Step 11: Commit**

```bash
git add src/discord/commands.ts src/discord/commands.test.ts src/discord/client.ts src/index.ts
git commit -m "feat(discord): wire /connect-token command and modal flow"
```

---

### Task 6: Manual verification & docs

**Files:**
- Modify: `README.md` (document `/connect-token` alongside `/link`)

- [ ] **Step 1: Manual smoke test (real Discord + GitHub)**

Follow the project's run instructions (see `README.md` / `npm run dev`) with valid env. In Discord:
1. Run `/connect-token` → confirm the ephemeral message shows **Create token on GitHub** (link) + **Paste my token** (button).
2. Click **Create token on GitHub** → confirm GitHub opens with `repo` and `notifications` pre-checked and the note pre-filled.
3. Generate a token, click **Paste my token**, paste it, submit → confirm `✅ Connected as @you via personal access token.` and that you receive the onboarding summary DM.
4. Paste a token missing `notifications` → confirm the rejection names the missing scope and nothing is stored.
5. Run `/status` → confirm it works against your (possibly org-restricted) repos.

If any step fails, stop and debug before proceeding.

- [ ] **Step 2: Update the README**

Add a short subsection near the existing `/link` documentation explaining `/connect-token`: what it is (a PAT-based alternative for users whose org restricts OAuth apps), that it needs `repo` + `notifications` scopes, and that the token is stored encrypted. Keep the style consistent with the surrounding README.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document /connect-token PAT connection"
```

---

## Self-Review

**Spec coverage:**
- Supplementary command (not replacing `/link`) → Task 5 registers `/connect-token`; `/link` untouched. ✓
- Pre-filled token URL → `CONNECT_TOKEN_CREATE_URL` (Task 4), Link button (Task 5), Global Constraints. ✓
- Message → button → modal secure flow → Task 5 steps 6-8. ✓
- Validate via `/user`, reject 401/403 → `validateToken` (Task 2) + `handleTokenSubmit` (Task 4). ✓
- Reject missing `repo`/`notifications` by name → Task 4 tests + impl. ✓
- Store encrypted with `auth_source='pat'`, replace existing connection → Task 1 (`upsertUser`) + Task 4. ✓
- Idempotent migration, default `'oauth'` → Task 1 step 4. ✓
- Baseline/onboarding to avoid flooding → Task 4 calls `deps.onConnect` (reuses `createOnConnect`). ✓
- Source-aware 401 messaging in `/status` and poller → Task 3. ✓
- Out of scope items (fine-grained PATs, GitHub App, expiry tracking) → not implemented. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `authSource` (camel) ↔ `auth_source` (column) consistent across Tasks 1/3/4; `TokenDeps.encrypt` returns `{ ciphertext, iv, tag }` matching `upsertUser`'s `enc` param and `crypto.Encrypted`; `validateToken` return `{ login, scopes }` matches `TokenDeps.validateToken` and `handleTokenSubmit` usage; constant names identical between `handlers.ts` (Task 4) and `client.ts` (Task 5). ✓

**Note for implementer:** Any pre-existing test that constructs a `User` object literal will fail to typecheck until `authSource` is added to it — fix those inline where the compiler points (mentioned in Tasks 1, 3).
