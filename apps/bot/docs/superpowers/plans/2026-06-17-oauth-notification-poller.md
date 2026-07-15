# OAuth + Notification Poller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the GitHub webhook receiver with a per-user OAuth connect flow + a background poller that DMs each new pull-request notification from GitHub's Notifications API.

**Architecture:** New additive modules (crypto, GitHub OAuth client, notifications client, DB tables, poller, HTTP callback route) are built and tested first so the suite stays green. A final cutover task rewrites `config`/`handlers`/`client`/`index`, deletes the webhook code, and trims the old DB/notifier surface. One process: discord.js gateway + Fastify (OAuth callback + health) + a 60s poll loop, sharing one SQLite store.

**Tech Stack:** Node 20 (global `fetch`), TypeScript (CommonJS), discord.js v14, Fastify v4, better-sqlite3, Node `crypto` (AES-256-GCM), vitest.

---

## File Structure

```
src/
  config.ts                env: add OAuth creds, encryption key, base URL; drop webhook vars  (CUTOVER)
  crypto.ts                AES-256-GCM encrypt/decrypt                                          (NEW)
  db.ts                    add users/notified/oauth_states tables + methods (additive),
                           then remove old links/sent in cutover
  github/
    http.ts                FetchLike type + defaultFetch wrapper                                (NEW)
    oauth.ts               buildAuthorizeUrl / exchangeCode / fetchViewerLogin                  (NEW)
    notifications.ts       fetchNotifications / parseNotifications / toHtmlUrl                  (NEW)
    webhook.ts             DELETED in cutover
    events.ts              DELETED in cutover
  http/
    routes.ts              Fastify GET /health + GET /oauth/callback                            (NEW)
  poller.ts                pollUser + startPoller                                               (NEW)
  notifier.ts              add formatNotification (additive); keep DmSender; drop old in cutover
  discord/
    handlers.ts            /link → OAuth URL, /unlink, /status                                  (CUTOVER)
    commands.ts            unchanged
    client.ts              startDiscord(token, db, linkDeps)                                    (CUTOVER)
  index.ts                 wire config/db/discord/routes/poller                                 (CUTOVER)
```

Shared types:

```ts
// github/notifications.ts
export interface NotificationItem {
  threadId: string; reason: string; updatedAt: string;
  repoFullName: string; prTitle: string; prUrl: string;
}
// crypto.ts
export interface Encrypted { ciphertext: string; iv: string; tag: string; } // all hex
// db.ts
export interface User {
  discordId: string; githubLogin: string;
  tokenCiphertext: string; tokenIv: string; tokenTag: string;
  lastModified: string | null; createdAt: string;
}
```

---

### Task 1: `crypto.ts` — token encryption

**Files:**
- Create: `src/crypto.ts`
- Test: `src/crypto.test.ts`

- [ ] **Step 1: Write the failing test** (`src/crypto.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "./crypto";

const KEY = "a".repeat(64); // 32 bytes in hex

describe("crypto", () => {
  it("round-trips a value", () => {
    const enc = encrypt("gho_secret-token", KEY);
    expect(enc.ciphertext).not.toContain("gho_secret-token");
    expect(decrypt(enc, KEY)).toBe("gho_secret-token");
  });

  it("produces a fresh iv each time", () => {
    expect(encrypt("x", KEY).iv).not.toBe(encrypt("x", KEY).iv);
  });

  it("fails to decrypt if the tag is tampered", () => {
    const enc = encrypt("x", KEY);
    expect(() => decrypt({ ...enc, tag: "0".repeat(enc.tag.length) }, KEY)).toThrow();
  });

  it("rejects a key that is not 32 bytes", () => {
    expect(() => encrypt("x", "abcd")).toThrow(/32 bytes/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/crypto.test.ts`
Expected: FAIL — cannot find module `./crypto`.

- [ ] **Step 3: Write minimal implementation** (`src/crypto.ts`)

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

export interface Encrypted {
  ciphertext: string; // hex
  iv: string;         // hex
  tag: string;        // hex
}

function keyBuffer(keyHex: string): Buffer {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error("Encryption key must be 32 bytes (64 hex characters)");
  }
  return key;
}

export function encrypt(plaintext: string, keyHex: string): Encrypted {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBuffer(keyHex), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("hex"),
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
  };
}

export function decrypt(enc: Encrypted, keyHex: string): string {
  const decipher = createDecipheriv("aes-256-gcm", keyBuffer(keyHex), Buffer.from(enc.iv, "hex"));
  decipher.setAuthTag(Buffer.from(enc.tag, "hex"));
  const out = Buffer.concat([decipher.update(Buffer.from(enc.ciphertext, "hex")), decipher.final()]);
  return out.toString("utf8");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/crypto.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/crypto.ts src/crypto.test.ts
git commit -m "feat: add AES-256-GCM token encryption"
```

---

### Task 2: `github/http.ts` + `github/oauth.ts` — OAuth client

**Files:**
- Create: `src/github/http.ts`
- Create: `src/github/oauth.ts`
- Test: `src/github/oauth.test.ts`

- [ ] **Step 1: Create the fetch abstraction** (`src/github/http.ts`)

```ts
// Minimal structural type so tests can supply a fake without constructing a real Response.
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export const defaultFetch: FetchLike = (url, init) =>
  (globalThis.fetch as unknown as FetchLike)(url, init);
```

- [ ] **Step 2: Write the failing test** (`src/github/oauth.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { buildAuthorizeUrl, exchangeCode, fetchViewerLogin } from "./oauth";
import type { FetchLike } from "./http";

function fakeFetch(handler: (url: string, init?: any) => any): FetchLike {
  return async (url, init) => {
    const r = handler(url, init);
    return {
      status: r.status ?? 200,
      ok: (r.status ?? 200) < 400,
      headers: { get: () => null },
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
    };
  };
}

describe("buildAuthorizeUrl", () => {
  it("includes client_id, redirect_uri, state and repo scope", () => {
    const url = buildAuthorizeUrl({ clientId: "cid", redirectUri: "https://h/oauth/callback", state: "s1" });
    expect(url).toContain("https://github.com/login/oauth/authorize?");
    expect(url).toContain("client_id=cid");
    expect(url).toContain("state=s1");
    expect(url).toContain("scope=repo");
    expect(url).toContain("redirect_uri=https%3A%2F%2Fh%2Foauth%2Fcallback");
  });
});

describe("exchangeCode", () => {
  it("returns the access token on success", async () => {
    const f = fakeFetch(() => ({ status: 200, body: { access_token: "gho_abc" } }));
    const token = await exchangeCode({ clientId: "c", clientSecret: "s", code: "code1" }, f);
    expect(token).toBe("gho_abc");
  });

  it("throws when GitHub returns an error", async () => {
    const f = fakeFetch(() => ({ status: 200, body: { error: "bad_verification_code" } }));
    await expect(exchangeCode({ clientId: "c", clientSecret: "s", code: "x" }, f)).rejects.toThrow();
  });
});

describe("fetchViewerLogin", () => {
  it("returns the login", async () => {
    const f = fakeFetch(() => ({ status: 200, body: { login: "octocat" } }));
    expect(await fetchViewerLogin("tok", f)).toBe("octocat");
  });

  it("throws on a non-ok response", async () => {
    const f = fakeFetch(() => ({ status: 401, body: {} }));
    await expect(fetchViewerLogin("tok", f)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/github/oauth.test.ts`
Expected: FAIL — cannot find module `./oauth`.

- [ ] **Step 4: Write minimal implementation** (`src/github/oauth.ts`)

```ts
import { type FetchLike, defaultFetch } from "./http";

export function buildAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    state: opts.state,
    scope: opts.scope ?? "repo",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeCode(
  opts: { clientId: string; clientSecret: string; code: string },
  fetchImpl: FetchLike = defaultFetch
): Promise<string> {
  const res = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      code: opts.code,
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`OAuth token exchange failed: ${data.error ?? res.status}`);
  }
  return data.access_token;
}

export async function fetchViewerLogin(
  token: string,
  fetchImpl: FetchLike = defaultFetch
): Promise<string> {
  const res = await fetchImpl("https://api.github.com/user", {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`Failed to fetch GitHub user: ${res.status}`);
  const data = (await res.json()) as { login?: string };
  if (!data.login) throw new Error("GitHub user response missing login");
  return data.login;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/github/oauth.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/github/http.ts src/github/oauth.ts src/github/oauth.test.ts
git commit -m "feat: add github oauth client"
```

---

### Task 3: `github/notifications.ts` — notifications client

**Files:**
- Create: `src/github/notifications.ts`
- Test: `src/github/notifications.test.ts`

- [ ] **Step 1: Write the failing test** (`src/github/notifications.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { parseNotifications, toHtmlUrl, fetchNotifications } from "./notifications";
import type { FetchLike } from "./http";

const prRaw = {
  id: "t1",
  reason: "review_requested",
  updated_at: "2026-06-17T10:00:00Z",
  repository: { full_name: "acme/repo" },
  subject: { title: "Fix bug", url: "https://api.github.com/repos/acme/repo/pulls/42", type: "PullRequest" },
};
const issueRaw = { ...prRaw, id: "t2", subject: { ...prRaw.subject, type: "Issue" } };

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}): FetchLike {
  return async () => ({
    status,
    ok: status < 400,
    headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

describe("toHtmlUrl", () => {
  it("converts a pulls API url to an html url", () => {
    expect(toHtmlUrl("https://api.github.com/repos/acme/repo/pulls/42")).toBe(
      "https://github.com/acme/repo/pull/42"
    );
  });
});

describe("parseNotifications", () => {
  it("keeps only pull requests and maps fields", () => {
    const items = parseNotifications([prRaw, issueRaw] as any);
    expect(items).toEqual([
      {
        threadId: "t1",
        reason: "review_requested",
        updatedAt: "2026-06-17T10:00:00Z",
        repoFullName: "acme/repo",
        prTitle: "Fix bug",
        prUrl: "https://github.com/acme/repo/pull/42",
      },
    ]);
  });
});

describe("fetchNotifications", () => {
  it("returns parsed items, last-modified and poll interval on 200", async () => {
    const f = fakeFetch(200, [prRaw], { "last-modified": "Mon, 01 Jan 2026 00:00:00 GMT", "x-poll-interval": "90" });
    const res = await fetchNotifications("tok", null, f);
    expect(res.status).toBe(200);
    expect(res.items).toHaveLength(1);
    expect(res.lastModified).toBe("Mon, 01 Jan 2026 00:00:00 GMT");
    expect(res.pollInterval).toBe(90);
  });

  it("returns empty items and the status on 304", async () => {
    const res = await fetchNotifications("tok", "Mon, 01 Jan 2026 00:00:00 GMT", fakeFetch(304, null));
    expect(res.status).toBe(304);
    expect(res.items).toEqual([]);
  });

  it("surfaces a 401 status without throwing", async () => {
    const res = await fetchNotifications("tok", null, fakeFetch(401, null));
    expect(res.status).toBe(401);
    expect(res.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/github/notifications.test.ts`
Expected: FAIL — cannot find module `./notifications`.

- [ ] **Step 3: Write minimal implementation** (`src/github/notifications.ts`)

```ts
import { type FetchLike, defaultFetch } from "./http";

export interface NotificationItem {
  threadId: string;
  reason: string;
  updatedAt: string;
  repoFullName: string;
  prTitle: string;
  prUrl: string;
}

export interface FetchResult {
  status: number;          // 200 | 304 | 401 | 403 | ...
  items: NotificationItem[];
  lastModified: string | null;
  pollInterval: number;    // seconds
}

interface RawNotification {
  id: string;
  reason: string;
  updated_at: string;
  repository: { full_name: string };
  subject: { title: string; url: string; type: string };
}

export function toHtmlUrl(apiUrl: string): string {
  return apiUrl
    .replace("https://api.github.com/repos/", "https://github.com/")
    .replace("/pulls/", "/pull/");
}

export function parseNotifications(raw: RawNotification[]): NotificationItem[] {
  return raw
    .filter((n) => n.subject?.type === "PullRequest")
    .map((n) => ({
      threadId: n.id,
      reason: n.reason,
      updatedAt: n.updated_at,
      repoFullName: n.repository.full_name,
      prTitle: n.subject.title,
      prUrl: toHtmlUrl(n.subject.url),
    }));
}

export async function fetchNotifications(
  token: string,
  lastModified: string | null,
  fetchImpl: FetchLike = defaultFetch
): Promise<FetchResult> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
  };
  if (lastModified) headers["if-modified-since"] = lastModified;

  const res = await fetchImpl("https://api.github.com/notifications?all=false", { headers });
  const pollInterval = Number(res.headers.get("x-poll-interval") ?? "60");
  const newLastModified = res.headers.get("last-modified");

  if (res.status !== 200) {
    return { status: res.status, items: [], lastModified: newLastModified, pollInterval };
  }
  const body = (await res.json()) as RawNotification[];
  return { status: 200, items: parseNotifications(body), lastModified: newLastModified, pollInterval };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/github/notifications.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/github/notifications.ts src/github/notifications.test.ts
git commit -m "feat: add github notifications client"
```

---

### Task 4: `db.ts` — add users / notified / oauth_states (additive)

**Files:**
- Modify: `src/db.ts` (ADD new types, tables, and methods — leave existing `links`/`sent` code untouched for now)
- Test: `src/db.test.ts` (ADD a new describe block)

- [ ] **Step 1: Add the failing tests** — append to `src/db.test.ts` (inside the file, after the existing tests, before the final closing brace of the file's top level):

```ts
describe("users", () => {
  it("upserts and reads a user", () => {
    db.upsertUser("d1", "octocat", { ciphertext: "ct", iv: "iv", tag: "tg" });
    const u = db.getUser("d1");
    expect(u?.githubLogin).toBe("octocat");
    expect(u?.tokenCiphertext).toBe("ct");
    expect(u?.lastModified).toBeNull();
  });

  it("upsert replaces token and resets last_modified", () => {
    db.upsertUser("d1", "octocat", { ciphertext: "ct", iv: "iv", tag: "tg" });
    db.updateLastModified("d1", "Mon");
    db.upsertUser("d1", "octocat", { ciphertext: "ct2", iv: "iv2", tag: "tg2" });
    const u = db.getUser("d1");
    expect(u?.tokenCiphertext).toBe("ct2");
    expect(u?.lastModified).toBeNull();
  });

  it("lists all users and deletes one", () => {
    db.upsertUser("d1", "a", { ciphertext: "1", iv: "1", tag: "1" });
    db.upsertUser("d2", "b", { ciphertext: "2", iv: "2", tag: "2" });
    expect(db.getAllUsers().map((u) => u.discordId).sort()).toEqual(["d1", "d2"]);
    expect(db.deleteUser("d1")).toBe(true);
    expect(db.deleteUser("d1")).toBe(false);
    expect(db.getUser("d1")).toBeNull();
  });

  it("updates last_modified", () => {
    db.upsertUser("d1", "a", { ciphertext: "1", iv: "1", tag: "1" });
    db.updateLastModified("d1", "Tue");
    expect(db.getUser("d1")?.lastModified).toBe("Tue");
  });
});

describe("notified dedup", () => {
  it("tracks per (discord, thread, updatedAt)", () => {
    expect(db.wasNotified("d1", "t1", "u1")).toBe(false);
    db.markNotified("d1", "t1", "u1");
    expect(db.wasNotified("d1", "t1", "u1")).toBe(true);
    expect(db.wasNotified("d1", "t1", "u2")).toBe(false);
  });

  it("markNotified is idempotent", () => {
    db.markNotified("d1", "t1", "u1");
    expect(() => db.markNotified("d1", "t1", "u1")).not.toThrow();
  });
});

describe("oauth states", () => {
  it("consumes a valid state once, returning the discord id", () => {
    db.createState("s1", "d1");
    expect(db.consumeState("s1", 60_000)).toBe("d1");
    expect(db.consumeState("s1", 60_000)).toBeNull(); // single use
  });

  it("rejects an expired state", () => {
    db.createState("s2", "d1");
    expect(db.consumeState("s2", -1)).toBeNull(); // any age exceeds a -1ms TTL
  });

  it("returns null for an unknown state", () => {
    expect(db.consumeState("nope", 60_000)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/db.test.ts`
Expected: FAIL — `db.upsertUser is not a function` (and similar).

- [ ] **Step 3: Add types, tables and methods to `src/db.ts`**

Add these exported types near the top (after the existing `Link`/`UpsertResult` types):

```ts
export interface User {
  discordId: string;
  githubLogin: string;
  tokenCiphertext: string;
  tokenIv: string;
  tokenTag: string;
  lastModified: string | null;
  createdAt: string;
}
```

Add these members to the `Database` interface:

```ts
  upsertUser(discordId: string, githubLogin: string, enc: { ciphertext: string; iv: string; tag: string }): void;
  getUser(discordId: string): User | null;
  getAllUsers(): User[];
  deleteUser(discordId: string): boolean;
  updateLastModified(discordId: string, lastModified: string): void;
  wasNotified(discordId: string, threadId: string, updatedAt: string): boolean;
  markNotified(discordId: string, threadId: string, updatedAt: string): void;
  createState(state: string, discordId: string): void;
  consumeState(state: string, maxAgeMs: number): string | null;
```

Add these tables to the `sql.exec(...)` schema string (append inside the same template):

```sql
    CREATE TABLE IF NOT EXISTS users (
      discord_id       TEXT PRIMARY KEY,
      github_login     TEXT NOT NULL,
      token_ciphertext TEXT NOT NULL,
      token_iv         TEXT NOT NULL,
      token_tag        TEXT NOT NULL,
      last_modified    TEXT,
      created_at       TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notified (
      discord_id  TEXT NOT NULL,
      thread_id   TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      sent_at     TEXT NOT NULL,
      UNIQUE (discord_id, thread_id, updated_at)
    );
    CREATE TABLE IF NOT EXISTS oauth_states (
      state      TEXT PRIMARY KEY,
      discord_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
```

Add these methods to the object returned by `createDatabase` (alongside the existing ones):

```ts
    upsertUser(discordId, githubLogin, enc): void {
      sql
        .prepare(
          `INSERT INTO users (discord_id, github_login, token_ciphertext, token_iv, token_tag, last_modified, created_at)
           VALUES (?, ?, ?, ?, ?, NULL, ?)
           ON CONFLICT(discord_id) DO UPDATE SET
             github_login = excluded.github_login,
             token_ciphertext = excluded.token_ciphertext,
             token_iv = excluded.token_iv,
             token_tag = excluded.token_tag,
             last_modified = NULL`
        )
        .run(discordId, githubLogin, enc.ciphertext, enc.iv, enc.tag, new Date().toISOString());
    },

    getUser(discordId): User | null {
      const r = sql
        .prepare(
          "SELECT discord_id, github_login, token_ciphertext, token_iv, token_tag, last_modified, created_at FROM users WHERE discord_id = ?"
        )
        .get(discordId) as
        | {
            discord_id: string;
            github_login: string;
            token_ciphertext: string;
            token_iv: string;
            token_tag: string;
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
            lastModified: r.last_modified,
            createdAt: r.created_at,
          }
        : null;
    },

    getAllUsers(): User[] {
      const rows = sql
        .prepare(
          "SELECT discord_id, github_login, token_ciphertext, token_iv, token_tag, last_modified, created_at FROM users"
        )
        .all() as {
        discord_id: string;
        github_login: string;
        token_ciphertext: string;
        token_iv: string;
        token_tag: string;
        last_modified: string | null;
        created_at: string;
      }[];
      return rows.map((r) => ({
        discordId: r.discord_id,
        githubLogin: r.github_login,
        tokenCiphertext: r.token_ciphertext,
        tokenIv: r.token_iv,
        tokenTag: r.token_tag,
        lastModified: r.last_modified,
        createdAt: r.created_at,
      }));
    },

    deleteUser(discordId): boolean {
      return sql.prepare("DELETE FROM users WHERE discord_id = ?").run(discordId).changes > 0;
    },

    updateLastModified(discordId, lastModified): void {
      sql.prepare("UPDATE users SET last_modified = ? WHERE discord_id = ?").run(lastModified, discordId);
    },

    wasNotified(discordId, threadId, updatedAt): boolean {
      return (
        sql
          .prepare("SELECT 1 FROM notified WHERE discord_id = ? AND thread_id = ? AND updated_at = ?")
          .get(discordId, threadId, updatedAt) !== undefined
      );
    },

    markNotified(discordId, threadId, updatedAt): void {
      sql
        .prepare("INSERT OR IGNORE INTO notified (discord_id, thread_id, updated_at, sent_at) VALUES (?, ?, ?, ?)")
        .run(discordId, threadId, updatedAt, new Date().toISOString());
    },

    createState(state, discordId): void {
      sql
        .prepare("INSERT OR REPLACE INTO oauth_states (state, discord_id, created_at) VALUES (?, ?, ?)")
        .run(state, discordId, new Date().toISOString());
    },

    consumeState(state, maxAgeMs): string | null {
      const r = sql
        .prepare("SELECT discord_id, created_at FROM oauth_states WHERE state = ?")
        .get(state) as { discord_id: string; created_at: string } | undefined;
      if (!r) return null;
      sql.prepare("DELETE FROM oauth_states WHERE state = ?").run(state); // single use
      if (Date.now() - new Date(r.created_at).getTime() > maxAgeMs) return null;
      return r.discord_id;
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/db.test.ts`
Expected: PASS (existing link/dedup tests + the new users/notified/oauth tests).

- [ ] **Step 5: Commit**

```bash
git add src/db.ts src/db.test.ts
git commit -m "feat: add users, notified, and oauth_states storage"
```

---

### Task 5: `notifier.ts` — add `formatNotification` (additive)

**Files:**
- Modify: `src/notifier.ts` (ADD `formatNotification` + import `NotificationItem`; leave `DmSender`, `formatMessage`, `createNotifier` in place for now)
- Test: `src/notifier.test.ts` (ADD a describe block)

- [ ] **Step 1: Add the failing test** — append to `src/notifier.test.ts`:

```ts
import { formatNotification } from "./notifier";
import type { NotificationItem } from "./github/notifications";

const item: NotificationItem = {
  threadId: "t1",
  reason: "review_requested",
  updatedAt: "2026-06-17T10:00:00Z",
  repoFullName: "acme/repo",
  prTitle: "Fix the widget",
  prUrl: "https://github.com/acme/repo/pull/42",
};

describe("formatNotification", () => {
  it("renders a review_requested notification", () => {
    const msg = formatNotification(item);
    expect(msg).toContain("Review requested");
    expect(msg).toContain("acme/repo");
    expect(msg).toContain("Fix the widget");
    expect(msg).toContain("https://github.com/acme/repo/pull/42");
  });

  it("falls back to a generic prefix for unknown reasons", () => {
    expect(formatNotification({ ...item, reason: "subscribed" })).toContain("New activity");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/notifier.test.ts`
Expected: FAIL — `formatNotification` is not exported.

- [ ] **Step 3: Add the implementation** to `src/notifier.ts` (add the import at the top and the function + map below the existing exports):

```ts
import type { NotificationItem } from "./github/notifications";

const REASON_PREFIX: Record<string, string> = {
  review_requested: "🔔 Review requested",
  comment: "💬 New comment",
  mention: "📣 Mentioned",
  state_change: "🔀 State changed",
  author: "✍️ Activity on your PR",
};

export function formatNotification(item: NotificationItem): string {
  const prefix = REASON_PREFIX[item.reason] ?? "🔔 New activity";
  return [`${prefix} on **${item.repoFullName}**`, item.prTitle, item.prUrl].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/notifier.test.ts`
Expected: PASS (existing tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/notifier.ts src/notifier.test.ts
git commit -m "feat: add notification message formatter"
```

---

### Task 6: `poller.ts` — poll loop

**Files:**
- Create: `src/poller.ts`
- Test: `src/poller.test.ts`

- [ ] **Step 1: Write the failing test** (`src/poller.test.ts`)

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDatabase, type Database, type User } from "./db";
import { pollUser, type PollerDeps } from "./poller";
import type { FetchResult } from "./github/notifications";
import type { DmSender } from "./notifier";

let db: Database;
let sent: { discordId: string; message: string }[];
let sender: DmSender;
let nextResult: FetchResult;

const prItem = {
  threadId: "t1",
  reason: "review_requested",
  updatedAt: "2026-06-17T10:00:00Z",
  repoFullName: "acme/repo",
  prTitle: "Fix",
  prUrl: "https://github.com/acme/repo/pull/1",
};

function user(): User {
  return db.getUser("d1")!;
}
function deps(): PollerDeps {
  return { db, sender, decryptToken: () => "tok", fetchNotifications: async () => nextResult };
}

beforeEach(() => {
  db = createDatabase(":memory:");
  db.upsertUser("d1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
  sent = [];
  sender = { sendDm: async (discordId, message) => { sent.push({ discordId, message }); } };
});

it("DMs a new PR notification and marks it", async () => {
  nextResult = { status: 200, items: [prItem], lastModified: "Mon", pollInterval: 60 };
  await pollUser(deps(), user());
  expect(sent).toHaveLength(1);
  expect(sent[0].discordId).toBe("d1");
  expect(db.wasNotified("d1", "t1", prItem.updatedAt)).toBe(true);
});

it("does not re-DM the same thread + updatedAt", async () => {
  nextResult = { status: 200, items: [prItem], lastModified: null, pollInterval: 60 };
  await pollUser(deps(), user());
  await pollUser(deps(), user());
  expect(sent).toHaveLength(1);
});

it("re-DMs when updatedAt changes", async () => {
  nextResult = { status: 200, items: [prItem], lastModified: null, pollInterval: 60 };
  await pollUser(deps(), user());
  nextResult = { status: 200, items: [{ ...prItem, updatedAt: "2026-07-01T00:00:00Z" }], lastModified: null, pollInterval: 60 };
  await pollUser(deps(), user());
  expect(sent).toHaveLength(2);
});

it("ignores a 304", async () => {
  nextResult = { status: 304, items: [], lastModified: null, pollInterval: 60 };
  await pollUser(deps(), user());
  expect(sent).toHaveLength(0);
});

it("on 401 sends a reconnect notice and deletes the user", async () => {
  nextResult = { status: 401, items: [], lastModified: null, pollInterval: 60 };
  await pollUser(deps(), user());
  expect(sent).toHaveLength(1);
  expect(sent[0].message).toMatch(/reconnect|expired|revoked/i);
  expect(db.getUser("d1")).toBeNull();
});

it("does not mark notified when the DM fails", async () => {
  nextResult = { status: 200, items: [prItem], lastModified: null, pollInterval: 60 };
  const failing: PollerDeps = { ...deps(), sender: { sendDm: vi.fn(async () => { throw new Error("closed"); }) } };
  await pollUser(failing, user());
  expect(db.wasNotified("d1", "t1", prItem.updatedAt)).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/poller.test.ts`
Expected: FAIL — cannot find module `./poller`.

- [ ] **Step 3: Write minimal implementation** (`src/poller.ts`)

```ts
import type { Database, User } from "./db";
import type { FetchResult } from "./github/notifications";
import { formatNotification, type DmSender } from "./notifier";

export interface PollerDeps {
  db: Database;
  sender: DmSender;
  decryptToken(user: User): string;
  fetchNotifications(token: string, lastModified: string | null): Promise<FetchResult>;
}

export async function pollUser(deps: PollerDeps, user: User): Promise<void> {
  let token: string;
  try {
    token = deps.decryptToken(user);
  } catch (err) {
    console.error(`Failed to decrypt token for ${user.discordId}:`, err);
    return;
  }

  const res = await deps.fetchNotifications(token, user.lastModified);

  if (res.status === 304) return;

  if (res.status === 401) {
    try {
      await deps.sender.sendDm(
        user.discordId,
        "⚠️ Your GitHub connection expired or was revoked. Run `/link` to reconnect."
      );
    } catch (err) {
      console.warn(`Failed to DM revocation notice to ${user.discordId}:`, err);
    }
    deps.db.deleteUser(user.discordId);
    return;
  }

  if (res.status !== 200) {
    console.warn(`Notifications fetch for ${user.discordId} returned ${res.status}`);
    return;
  }

  if (res.lastModified) deps.db.updateLastModified(user.discordId, res.lastModified);

  for (const item of res.items) {
    if (deps.db.wasNotified(user.discordId, item.threadId, item.updatedAt)) continue;
    try {
      await deps.sender.sendDm(user.discordId, formatNotification(item));
      deps.db.markNotified(user.discordId, item.threadId, item.updatedAt);
    } catch (err) {
      console.warn(`Failed to DM ${user.discordId} for thread ${item.threadId}:`, err);
    }
  }
}

export function startPoller(deps: PollerDeps, intervalMs = 60_000): { stop(): void } {
  const tick = async () => {
    for (const user of deps.db.getAllUsers()) {
      try {
        await pollUser(deps, user);
      } catch (err) {
        console.error(`Poll failed for ${user.discordId}:`, err);
      }
    }
  };
  const handle = setInterval(() => void tick(), intervalMs);
  void tick(); // run an initial pass immediately
  return { stop: () => clearInterval(handle) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/poller.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/poller.ts src/poller.test.ts
git commit -m "feat: add notification poll loop"
```

---

### Task 7: `http/routes.ts` — health + OAuth callback

**Files:**
- Create: `src/http/routes.ts`
- Test: `src/http/routes.test.ts`

- [ ] **Step 1: Write the failing test** (`src/http/routes.test.ts`)

```ts
import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import { createDatabase, type Database } from "../db";
import { encrypt, decrypt } from "../crypto";
import { registerHttpRoutes } from "./routes";

const KEY = "a".repeat(64);
let db: Database;

async function buildApp(over: Partial<{ exchangeCode: (c: string) => Promise<string>; fetchViewerLogin: (t: string) => Promise<string> }> = {}) {
  const app = Fastify();
  registerHttpRoutes(app, {
    db,
    encrypt: (token) => encrypt(token, KEY),
    exchangeCode: over.exchangeCode ?? (async () => "gho_token"),
    fetchViewerLogin: over.fetchViewerLogin ?? (async () => "octocat"),
    stateTtlMs: 60_000,
  });
  await app.ready();
  return app;
}

beforeEach(() => {
  db = createDatabase(":memory:");
});

describe("GET /health", () => {
  it("returns ok", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});

describe("GET /oauth/callback", () => {
  it("stores an encrypted token for a valid state", async () => {
    db.createState("s1", "discord-1");
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/oauth/callback?code=abc&state=s1" });
    expect(res.statusCode).toBe(200);
    const user = db.getUser("discord-1");
    expect(user?.githubLogin).toBe("octocat");
    expect(decrypt({ ciphertext: user!.tokenCiphertext, iv: user!.tokenIv, tag: user!.tokenTag }, KEY)).toBe("gho_token");
  });

  it("rejects an unknown/expired state with 400 and stores nothing", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/oauth/callback?code=abc&state=nope" });
    expect(res.statusCode).toBe(400);
    expect(db.getAllUsers()).toHaveLength(0);
  });

  it("returns 502 when the token exchange fails", async () => {
    db.createState("s2", "discord-2");
    const app = await buildApp({ exchangeCode: async () => { throw new Error("bad code"); } });
    const res = await app.inject({ method: "GET", url: "/oauth/callback?code=abc&state=s2" });
    expect(res.statusCode).toBe(502);
    expect(db.getUser("discord-2")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/http/routes.test.ts`
Expected: FAIL — cannot find module `./routes`.

- [ ] **Step 3: Write minimal implementation** (`src/http/routes.ts`)

```ts
import type { FastifyInstance } from "fastify";
import type { Database } from "../db";
import type { Encrypted } from "../crypto";

export interface HttpDeps {
  db: Database;
  encrypt(token: string): Encrypted;
  exchangeCode(code: string): Promise<string>;
  fetchViewerLogin(token: string): Promise<string>;
  stateTtlMs: number;
}

function page(title: string, body: string): string {
  return `<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:3rem"><h2>${title}</h2><p>${body}</p></body></html>`;
}

export function registerHttpRoutes(app: FastifyInstance, deps: HttpDeps): void {
  app.get("/health", async () => ({ ok: true }));

  app.get("/oauth/callback", async (req, reply) => {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state) {
      return reply.code(400).type("text/html").send(page("Missing parameters", "No code or state provided."));
    }
    const discordId = deps.db.consumeState(state, deps.stateTtlMs);
    if (!discordId) {
      return reply
        .code(400)
        .type("text/html")
        .send(page("Link expired", "This link is invalid or expired. Run /link in Discord again."));
    }
    try {
      const token = await deps.exchangeCode(code);
      const login = await deps.fetchViewerLogin(token);
      deps.db.upsertUser(discordId, login, deps.encrypt(token));
      return reply
        .type("text/html")
        .send(page("Connected", `Connected as <b>${login}</b>. You can return to Discord.`));
    } catch (err) {
      req.log.error(err);
      return reply
        .code(502)
        .type("text/html")
        .send(page("Connection failed", "Could not complete the GitHub connection. Try /link again."));
    }
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/http/routes.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/http/routes.ts src/http/routes.test.ts
git commit -m "feat: add health and oauth callback routes"
```

---

### Task 8: Cutover — wire the new system, remove the webhook

This task swaps the application over to OAuth + polling and removes the obsolete webhook code. Do the steps in order so the build only goes green at the end. Verified by a full build + suite.

**Files:**
- Modify: `src/config.ts`, `src/config.test.ts`
- Modify: `src/discord/handlers.ts`, `src/discord/handlers.test.ts`
- Modify: `src/discord/client.ts`
- Modify: `src/index.ts`
- Modify: `src/db.ts`, `src/db.test.ts` (remove old `links`/`sent` surface)
- Modify: `src/notifier.ts`, `src/notifier.test.ts` (remove old `formatMessage`/`createNotifier`)
- Delete: `src/github/webhook.ts`, `src/github/webhook.test.ts`, `src/github/events.ts`, `src/github/events.test.ts`
- Modify: `.env.example`, `README.md`

- [ ] **Step 1: Rewrite `src/config.ts`** (replace the entire file)

```ts
export interface Config {
  discordToken: string;
  discordClientId: string;
  databasePath: string;
  port: number;
  githubOAuthClientId: string;
  githubOAuthClientSecret: string;
  tokenEncryptionKey: string;
  publicBaseUrl: string;
}

const REQUIRED = [
  "DISCORD_TOKEN",
  "DISCORD_CLIENT_ID",
  "DATABASE_PATH",
  "PORT",
  "GITHUB_OAUTH_CLIENT_ID",
  "GITHUB_OAUTH_CLIENT_SECRET",
  "TOKEN_ENCRYPTION_KEY",
  "PUBLIC_BASE_URL",
] as const;

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const missing = REQUIRED.filter((k) => !env[k]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  const port = Number(env.PORT);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT must be a positive integer, got: ${env.PORT}`);
  }

  const key = env.TOKEN_ENCRYPTION_KEY!.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }

  return {
    discordToken: env.DISCORD_TOKEN!.trim(),
    discordClientId: env.DISCORD_CLIENT_ID!.trim(),
    databasePath: env.DATABASE_PATH!.trim(),
    port,
    githubOAuthClientId: env.GITHUB_OAUTH_CLIENT_ID!.trim(),
    githubOAuthClientSecret: env.GITHUB_OAUTH_CLIENT_SECRET!.trim(),
    tokenEncryptionKey: key,
    publicBaseUrl: env.PUBLIC_BASE_URL!.trim().replace(/\/+$/, ""),
  };
}
```

- [ ] **Step 2: Rewrite `src/config.test.ts`** (replace the entire file)

```ts
import { describe, it, expect } from "vitest";
import { loadConfig } from "./config";

const base = {
  DISCORD_TOKEN: "t",
  DISCORD_CLIENT_ID: "c",
  DATABASE_PATH: "./data/bot.sqlite",
  PORT: "3000",
  GITHUB_OAUTH_CLIENT_ID: "cid",
  GITHUB_OAUTH_CLIENT_SECRET: "csecret",
  TOKEN_ENCRYPTION_KEY: "a".repeat(64),
  PUBLIC_BASE_URL: "https://example.com/",
};

describe("loadConfig", () => {
  it("loads and types all values, trimming a trailing slash from the base url", () => {
    const cfg = loadConfig(base);
    expect(cfg.discordToken).toBe("t");
    expect(cfg.port).toBe(3000);
    expect(cfg.githubOAuthClientId).toBe("cid");
    expect(cfg.tokenEncryptionKey).toBe("a".repeat(64));
    expect(cfg.publicBaseUrl).toBe("https://example.com");
  });

  it("throws listing every missing required var", () => {
    expect(() => loadConfig({})).toThrowError(
      /DISCORD_TOKEN.*GITHUB_OAUTH_CLIENT_ID.*TOKEN_ENCRYPTION_KEY.*PUBLIC_BASE_URL/s
    );
  });

  it("throws when PORT is not a positive integer", () => {
    expect(() => loadConfig({ ...base, PORT: "abc" })).toThrowError(/PORT/);
  });

  it("throws when TOKEN_ENCRYPTION_KEY is not 64 hex chars", () => {
    expect(() => loadConfig({ ...base, TOKEN_ENCRYPTION_KEY: "tooshort" })).toThrowError(/TOKEN_ENCRYPTION_KEY/);
  });
});
```

Run: `npx vitest run src/config.test.ts` → PASS (4 tests).

- [ ] **Step 3: Rewrite `src/discord/handlers.ts`** (replace the entire file)

```ts
import type { Database } from "../db";

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

export async function handleStatus(ctx: CommandContext, db: Database): Promise<void> {
  const user = db.getUser(ctx.userId);
  await ctx.reply(
    user
      ? `✅ Connected as GitHub user \`${user.githubLogin}\`.`
      : "You're not connected. Run `/link` to connect your GitHub account."
  );
}
```

- [ ] **Step 4: Rewrite `src/discord/handlers.test.ts`** (replace the entire file)

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createDatabase, type Database } from "../db";
import { handleLink, handleUnlink, handleStatus, type CommandContext, type LinkDeps } from "./handlers";

let db: Database;
let replies: string[];

const linkDeps: LinkDeps = {
  generateState: () => "test-state",
  authorizeUrl: (state) => `https://github.com/login/oauth/authorize?state=${state}`,
};

function ctx(userId = "user1"): CommandContext {
  return { userId, guildId: "g1", getOption: () => null, reply: async (m) => { replies.push(m); } };
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
  it("shows the connected login", async () => {
    db.upsertUser("user1", "octocat", { ciphertext: "a", iv: "b", tag: "c" });
    await handleStatus(ctx(), db);
    expect(replies[0]).toContain("octocat");
  });

  it("shows when not connected", async () => {
    await handleStatus(ctx(), db);
    expect(replies[0]).toMatch(/not connected/i);
  });
});
```

Run: `npx vitest run src/discord/handlers.test.ts` → PASS (5 tests).

- [ ] **Step 5: Rewrite `src/discord/client.ts`** (replace the entire file — `startDiscord` now takes `linkDeps`)

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
} from "./handlers";

function toContext(interaction: ChatInputCommandInteraction): CommandContext {
  return {
    userId: interaction.user.id,
    guildId: interaction.guildId,
    getOption: (name) => interaction.options.getString(name),
    reply: async (message) => {
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
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
  linkDeps: LinkDeps
): Promise<DiscordRuntime> {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const ctx = toContext(interaction);
    try {
      if (interaction.commandName === "link") await handleLink(ctx, db, linkDeps);
      else if (interaction.commandName === "unlink") await handleUnlink(ctx, db);
      else if (interaction.commandName === "status") await handleStatus(ctx, db);
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

- [ ] **Step 6: Rewrite `src/index.ts`** (replace the entire file)

```ts
import { randomBytes } from "crypto";
import Fastify from "fastify";
import { loadConfig } from "./config";
import { createDatabase } from "./db";
import { encrypt, decrypt } from "./crypto";
import { registerCommands } from "./discord/commands";
import { startDiscord } from "./discord/client";
import { buildAuthorizeUrl, exchangeCode, fetchViewerLogin } from "./github/oauth";
import { fetchNotifications } from "./github/notifications";
import { registerHttpRoutes } from "./http/routes";
import { startPoller } from "./poller";

const STATE_TTL_MS = 10 * 60 * 1000;

async function main() {
  const config = loadConfig(process.env);
  const db = createDatabase(config.databasePath);

  const linkDeps = {
    generateState: () => randomBytes(16).toString("hex"),
    authorizeUrl: (state: string) =>
      buildAuthorizeUrl({
        clientId: config.githubOAuthClientId,
        redirectUri: `${config.publicBaseUrl}/oauth/callback`,
        state,
      }),
  };

  await registerCommands(config.discordToken, config.discordClientId);
  const { client, sender } = await startDiscord(config.discordToken, db, linkDeps);

  const app = Fastify({ logger: true });
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
  });
  await app.listen({ host: "0.0.0.0", port: config.port });

  const poller = startPoller({
    db,
    sender,
    decryptToken: (user) =>
      decrypt(
        { ciphertext: user.tokenCiphertext, iv: user.tokenIv, tag: user.tokenTag },
        config.tokenEncryptionKey
      ),
    fetchNotifications: (token, lastModified) => fetchNotifications(token, lastModified),
  });

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    try {
      poller.stop();
      await app.close();
      await client.destroy();
      db.close();
    } catch (err) {
      console.error("Error during shutdown:", err);
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
```

- [ ] **Step 7: Trim `src/notifier.ts`** — remove the obsolete webhook-era exports, keep `DmSender` and `formatNotification`.

Delete from `src/notifier.ts`:
- the line `import type { NotificationEvent } from "./github/events";`
- the entire `formatMessage(event: NotificationEvent)` function
- the entire `createNotifier(...)` function

Keep: the `import type { NotificationItem } from "./github/notifications";` line, the `DmSender` interface, the `REASON_PREFIX` map, and `formatNotification`. The final file is:

```ts
import type { NotificationItem } from "./github/notifications";

export interface DmSender {
  sendDm(discordId: string, message: string): Promise<void>;
}

const REASON_PREFIX: Record<string, string> = {
  review_requested: "🔔 Review requested",
  comment: "💬 New comment",
  mention: "📣 Mentioned",
  state_change: "🔀 State changed",
  author: "✍️ Activity on your PR",
};

export function formatNotification(item: NotificationItem): string {
  const prefix = REASON_PREFIX[item.reason] ?? "🔔 New activity";
  return [`${prefix} on **${item.repoFullName}**`, item.prTitle, item.prUrl].join("\n");
}
```

- [ ] **Step 8: Trim `src/notifier.test.ts`** — remove the old `describe("formatMessage")` and `describe("notifier")` blocks (and their now-unused imports: `createDatabase`, `createNotifier`, `NotificationEvent`, `vi`). The final file is:

```ts
import { describe, it, expect } from "vitest";
import { formatNotification } from "./notifier";
import type { NotificationItem } from "./github/notifications";

const item: NotificationItem = {
  threadId: "t1",
  reason: "review_requested",
  updatedAt: "2026-06-17T10:00:00Z",
  repoFullName: "acme/repo",
  prTitle: "Fix the widget",
  prUrl: "https://github.com/acme/repo/pull/42",
};

describe("formatNotification", () => {
  it("renders a review_requested notification", () => {
    const msg = formatNotification(item);
    expect(msg).toContain("Review requested");
    expect(msg).toContain("acme/repo");
    expect(msg).toContain("Fix the widget");
    expect(msg).toContain("https://github.com/acme/repo/pull/42");
  });

  it("falls back to a generic prefix for unknown reasons", () => {
    expect(formatNotification({ ...item, reason: "subscribed" })).toContain("New activity");
  });
});
```

- [ ] **Step 9: Trim `src/db.ts`** — remove the obsolete `links`/`sent` surface.

Delete from `src/db.ts`:
- the `Link` interface and the `UpsertResult` type
- the `LinkRow` interface and the `toLink` helper
- the `links` and `sent` `CREATE TABLE` statements in the schema string
- the `Database` interface members: `upsertLink`, `removeLink`, `getLinkByDiscordId`, `getDiscordIdsByGithubLogin`, `wasSent`, `markSent`
- the implementations of those six methods in the returned object

Keep everything added in Task 4 (the `User` type, the `users`/`notified`/`oauth_states` tables, and the new methods) plus `close()`.

- [ ] **Step 10: Trim `src/db.test.ts`** — remove the old `describe("links")` and `describe("dedup")` blocks (the ones using `upsertLink`/`wasSent`). Keep the `describe("users")`, `describe("notified dedup")`, and `describe("oauth states")` blocks added in Task 4, plus the `beforeEach`/`afterEach` setup.

- [ ] **Step 11: Delete the obsolete webhook files**

```bash
git rm src/github/webhook.ts src/github/webhook.test.ts src/github/events.ts src/github/events.test.ts
```

- [ ] **Step 12: Update `.env.example`** (replace the entire file)

```bash
# Discord
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-application-id

# GitHub OAuth App (Settings → Developer settings → OAuth Apps)
GITHUB_OAUTH_CLIENT_ID=your-oauth-client-id
GITHUB_OAUTH_CLIENT_SECRET=your-oauth-client-secret

# 64 hex chars (32 bytes) — generate with: openssl rand -hex 32
TOKEN_ENCRYPTION_KEY=

# Public base URL where this service is reachable (OAuth callback host)
PUBLIC_BASE_URL=https://your-host

# Storage & server
DATABASE_PATH=./data/bot.sqlite
PORT=3000
```

- [ ] **Step 13: Update `README.md`** — replace the "How it works", "Setup", and "Usage" sections to describe OAuth instead of webhooks:

```markdown
## How it works

A single Node service runs a Discord bot (slash commands) plus a small web
server. Each user runs `/link` and authorizes the bot via GitHub OAuth; the bot
then polls their GitHub notifications and DMs them about pull-request activity
(review requests, re-reviews, comments, mentions) across every repo they can
access — no per-repo webhook setup.

## Setup

1. **Create a Discord application & bot** at <https://discord.com/developers>.
   Copy the bot token and application (client) ID. Invite the bot with the
   `applications.commands` and `bot` scopes.
2. **Create a GitHub OAuth App** at GitHub → Settings → Developer settings →
   OAuth Apps. Set the Authorization callback URL to
   `<PUBLIC_BASE_URL>/oauth/callback`. Copy the client id and secret.
3. **Configure environment** — copy `.env.example` to `.env` and fill in the
   Discord and GitHub OAuth values, a `TOKEN_ENCRYPTION_KEY`
   (`openssl rand -hex 32`), and `PUBLIC_BASE_URL` (the public HTTPS URL of the
   service).
4. **Deploy** to Railway / Fly / Render as a single service with a persistent
   volume for `DATABASE_PATH`. Ensure `PUBLIC_BASE_URL` matches the deployed URL.

> The bot requests the `repo` OAuth scope, which is required to read private-repo
> notifications. This grants broad access to your repositories; only connect
> accounts you trust the host with.

## Usage

In Discord:

- `/link` — get a personal GitHub authorization link; click it to connect
- `/unlink` — disconnect and stop notifications
- `/status` — show which GitHub account you're connected as
```

- [ ] **Step 14: Verify the full build and suite**

Run: `npm run build` → expect exit 0 (no TypeScript errors).
Run: `npm test` → expect all suites passing: `crypto`, `github/oauth`, `github/notifications`, `db`, `notifier`, `poller`, `http/routes`, `discord/handlers`, `discord/commands`, `config`.

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "feat: cut over to OAuth connect + notification poller; remove webhook"
```

---

## Self-Review Notes

- **Spec coverage:** OAuth App flow (Tasks 2, 7, 8 — `/link`→authorize→callback→token), Notifications API polling with `If-Modified-Since`/`X-Poll-Interval`/304 (Tasks 3, 6), PR-only filter + reason-based message (Tasks 3, 5), dedup on `(discord_id, thread_id, updated_at)` (Tasks 4, 6), encrypted-at-rest tokens (Tasks 1, 7), 401→DM+delete-user (Task 6), single-use TTL state (Task 4), config + env changes (Task 8), schema (Tasks 4, 8), security/README notes (Task 8), tests (every task). Webhook removal (Task 8). All spec sections map to a task.
- **Rate-limit (403) handling:** the spec mentions backing off until reset; the poller treats 403 as "skip this user this tick" and the 60s loop interval + `If-Modified-Since` (free 304s) keeps request volume low for a few users. A dedicated reset-aware backoff is deliberately out of scope for v1 (documented here so it isn't a silent gap).
- **Type consistency:** `User`/`NotificationItem`/`Encrypted`/`FetchResult`/`PollerDeps`/`LinkDeps`/`HttpDeps`/`DmSender` are each defined once and imported where used; `startDiscord(token, db, linkDeps)` matches its call in `index.ts`; `consumeState(state, maxAgeMs)` signature matches all call sites; `fetchNotifications(token, lastModified)` matches the poller dep type.
- **Green-at-each-commit:** Tasks 1–7 are additive (new files, or additive DB/notifier members) so the build and full suite stay green. Only Task 8 removes old code, and it restores a green build + suite at its final step.
