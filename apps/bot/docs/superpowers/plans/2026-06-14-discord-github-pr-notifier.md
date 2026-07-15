# Discord GitHub PR Review Notifier — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single Node/TypeScript service that DMs a linked Discord user when their review is requested on a GitHub pull request.

**Architecture:** One process runs both a discord.js gateway connection (slash commands `/link`, `/unlink`, `/status`) and a Fastify HTTP server that receives GitHub `pull_request` webhooks. A webhook event is HMAC-verified, parsed into a normalized event, mapped from GitHub login to Discord user via SQLite, and delivered as a DM. Modules have strict boundaries: the webhook half never touches Discord, and the notifier half never touches HTTP or signature verification.

**Tech Stack:** Node.js 20, TypeScript (CommonJS output), discord.js v14, Fastify v4, better-sqlite3, vitest for tests, tsx for local dev.

---

## File Structure

```
discord-github-pr/
  package.json
  tsconfig.json
  .env.example
  Dockerfile
  src/
    config.ts            env loading + validation
    db.ts                SQLite layer (the ONLY module importing better-sqlite3)
    notifier.ts          normalized event -> recipients -> DMs (+ formatMessage)
    github/
      events.ts          payload types + parseEvent
      webhook.ts         verifySignature + Fastify route
    discord/
      handlers.ts        /link, /unlink, /status logic (framework-agnostic)
      commands.ts        slash command definitions + registration
      client.ts          discord.js client, DM sender, interaction adapter
    index.ts             wires everything; starts gateway + HTTP server
  src/**/*.test.ts        colocated vitest tests
```

Shared types used across modules (defined in `github/events.ts`):

```ts
export interface NotificationEvent {
  prNodeId: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  repoFullName: string;
  repoOwner: string;
  author: string;
  recipients: string[]; // GitHub logins whose review is requested
}
```

The DM-sending boundary (defined in `notifier.ts`):

```ts
export interface DmSender {
  sendDm(discordId: string, message: string): Promise<void>;
}
```

---

### Task 1: Project scaffold & tooling

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `src/index.ts` (temporary placeholder, replaced in Task 10)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "discord-github-pr",
  "version": "1.0.0",
  "private": true,
  "description": "Discord bot that DMs you when a GitHub PR needs your review.",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "discord.js": "^14.16.0",
    "fastify": "^4.28.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^20.16.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "src/**/*.test.ts"]
}
```

- [ ] **Step 3: Create `.env.example`**

```bash
# Discord
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-application-id

# GitHub webhook
GITHUB_WEBHOOK_SECRET=a-long-random-string

# Storage & server
DATABASE_PATH=./data/bot.sqlite
PORT=3000

# Optional: comma-separated allowlist of repo owners (orgs/users).
# Leave unset to accept any correctly-signed sender.
# ALLOWED_OWNERS=my-org,my-username
```

- [ ] **Step 4: Create temporary `src/index.ts` placeholder**

```ts
// Replaced in Task 10 with the real wiring.
console.log("discord-github-pr placeholder");
```

- [ ] **Step 5: Install dependencies and verify the toolchain**

Run: `npm install && npm run typecheck`
Expected: install completes; `tsc --noEmit` exits 0 with no output.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json .env.example src/index.ts
git commit -m "chore: scaffold project, tooling, and tsconfig"
```

---

### Task 2: `config.ts` — env loading & validation

**Files:**
- Create: `src/config.ts`
- Test: `src/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { loadConfig } from "./config";

const base = {
  DISCORD_TOKEN: "t",
  DISCORD_CLIENT_ID: "c",
  GITHUB_WEBHOOK_SECRET: "s",
  DATABASE_PATH: "./data/bot.sqlite",
  PORT: "3000",
};

describe("loadConfig", () => {
  it("loads and types all values", () => {
    const cfg = loadConfig({ ...base, ALLOWED_OWNERS: "org, user " });
    expect(cfg.discordToken).toBe("t");
    expect(cfg.discordClientId).toBe("c");
    expect(cfg.githubWebhookSecret).toBe("s");
    expect(cfg.databasePath).toBe("./data/bot.sqlite");
    expect(cfg.port).toBe(3000);
    expect(cfg.allowedOwners).toEqual(["org", "user"]);
  });

  it("defaults allowedOwners to null when unset", () => {
    expect(loadConfig(base).allowedOwners).toBeNull();
  });

  it("throws listing every missing required var", () => {
    expect(() => loadConfig({})).toThrowError(
      /DISCORD_TOKEN.*DISCORD_CLIENT_ID.*GITHUB_WEBHOOK_SECRET.*DATABASE_PATH.*PORT/s
    );
  });

  it("throws when PORT is not a positive integer", () => {
    expect(() => loadConfig({ ...base, PORT: "abc" })).toThrowError(/PORT/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config.test.ts`
Expected: FAIL — cannot find module `./config`.

- [ ] **Step 3: Write minimal implementation**

```ts
export interface Config {
  discordToken: string;
  discordClientId: string;
  githubWebhookSecret: string;
  databasePath: string;
  port: number;
  allowedOwners: string[] | null;
}

const REQUIRED = [
  "DISCORD_TOKEN",
  "DISCORD_CLIENT_ID",
  "GITHUB_WEBHOOK_SECRET",
  "DATABASE_PATH",
  "PORT",
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

  const ownersRaw = env.ALLOWED_OWNERS?.trim();
  const allowedOwners = ownersRaw
    ? ownersRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  return {
    discordToken: env.DISCORD_TOKEN!.trim(),
    discordClientId: env.DISCORD_CLIENT_ID!.trim(),
    githubWebhookSecret: env.GITHUB_WEBHOOK_SECRET!.trim(),
    databasePath: env.DATABASE_PATH!.trim(),
    port,
    allowedOwners,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat: add config loading and validation"
```

---

### Task 3: `db.ts` — SQLite storage layer

**Files:**
- Create: `src/db.ts`
- Test: `src/db.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createDatabase, type Database } from "./db";

let db: Database;
beforeEach(() => {
  db = createDatabase(":memory:");
});

describe("links", () => {
  it("upserts and reads a link", () => {
    expect(db.upsertLink("d1", "octocat", "g1")).toEqual({ ok: true });
    const link = db.getLinkByDiscordId("d1");
    expect(link?.githubLogin).toBe("octocat");
    expect(link?.guildId).toBe("g1");
  });

  it("re-linking the same discord user replaces the login", () => {
    db.upsertLink("d1", "octocat", null);
    db.upsertLink("d1", "hubot", null);
    expect(db.getLinkByDiscordId("d1")?.githubLogin).toBe("hubot");
    expect(db.getDiscordIdsByGithubLogin("octocat")).toEqual([]);
  });

  it("rejects a login already claimed by another discord user", () => {
    db.upsertLink("d1", "octocat", null);
    expect(db.upsertLink("d2", "octocat", null)).toEqual({
      ok: false,
      reason: "github_login_taken",
    });
  });

  it("matches github logins case-insensitively", () => {
    db.upsertLink("d1", "OctoCat", null);
    expect(db.getDiscordIdsByGithubLogin("octocat")).toEqual(["d1"]);
  });

  it("removeLink reports whether a row was removed", () => {
    db.upsertLink("d1", "octocat", null);
    expect(db.removeLink("d1")).toBe(true);
    expect(db.removeLink("d1")).toBe(false);
    expect(db.getLinkByDiscordId("d1")).toBeNull();
  });
});

describe("dedup", () => {
  it("tracks sent notifications per delivery+login", () => {
    expect(db.wasSent("delivery-1", "octocat")).toBe(false);
    db.markSent("delivery-1", "octocat");
    expect(db.wasSent("delivery-1", "octocat")).toBe(true);
    expect(db.wasSent("delivery-2", "octocat")).toBe(false);
  });

  it("markSent is idempotent", () => {
    db.markSent("delivery-1", "octocat");
    expect(() => db.markSent("delivery-1", "octocat")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db.test.ts`
Expected: FAIL — cannot find module `./db`.

- [ ] **Step 3: Write minimal implementation**

```ts
import SQLite from "better-sqlite3";

export interface Link {
  discordId: string;
  githubLogin: string;
  guildId: string | null;
  createdAt: string;
}

export type UpsertResult =
  | { ok: true }
  | { ok: false; reason: "github_login_taken" };

export interface Database {
  upsertLink(
    discordId: string,
    githubLogin: string,
    guildId: string | null
  ): UpsertResult;
  removeLink(discordId: string): boolean;
  getLinkByDiscordId(discordId: string): Link | null;
  getDiscordIdsByGithubLogin(githubLogin: string): string[];
  wasSent(deliveryId: string, githubLogin: string): boolean;
  markSent(deliveryId: string, githubLogin: string): void;
  close(): void;
}

interface LinkRow {
  discord_id: string;
  github_login: string;
  guild_id: string | null;
  created_at: string;
}

export function createDatabase(path: string): Database {
  const sql = new SQLite(path);
  sql.pragma("journal_mode = WAL");
  sql.exec(`
    CREATE TABLE IF NOT EXISTS links (
      discord_id   TEXT NOT NULL UNIQUE,
      github_login TEXT NOT NULL COLLATE NOCASE UNIQUE,
      guild_id     TEXT,
      created_at   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sent (
      delivery_id  TEXT NOT NULL,
      github_login TEXT NOT NULL,
      sent_at      TEXT NOT NULL,
      UNIQUE (delivery_id, github_login)
    );
  `);

  const toLink = (r: LinkRow | undefined): Link | null =>
    r
      ? {
          discordId: r.discord_id,
          githubLogin: r.github_login,
          guildId: r.guild_id,
          createdAt: r.created_at,
        }
      : null;

  return {
    upsertLink(discordId, githubLogin, guildId): UpsertResult {
      const owner = sql
        .prepare("SELECT discord_id FROM links WHERE github_login = ?")
        .get(githubLogin) as { discord_id: string } | undefined;
      if (owner && owner.discord_id !== discordId) {
        return { ok: false, reason: "github_login_taken" };
      }
      const tx = sql.transaction(() => {
        sql.prepare("DELETE FROM links WHERE discord_id = ?").run(discordId);
        sql
          .prepare(
            "INSERT INTO links (discord_id, github_login, guild_id, created_at) VALUES (?, ?, ?, ?)"
          )
          .run(discordId, githubLogin, guildId, new Date().toISOString());
      });
      tx();
      return { ok: true };
    },

    removeLink(discordId): boolean {
      const info = sql
        .prepare("DELETE FROM links WHERE discord_id = ?")
        .run(discordId);
      return info.changes > 0;
    },

    getLinkByDiscordId(discordId): Link | null {
      return toLink(
        sql
          .prepare("SELECT * FROM links WHERE discord_id = ?")
          .get(discordId) as LinkRow | undefined
      );
    },

    getDiscordIdsByGithubLogin(githubLogin): string[] {
      return (
        sql
          .prepare("SELECT discord_id FROM links WHERE github_login = ?")
          .all(githubLogin) as { discord_id: string }[]
      ).map((r) => r.discord_id);
    },

    wasSent(deliveryId, githubLogin): boolean {
      return (
        sql
          .prepare(
            "SELECT 1 FROM sent WHERE delivery_id = ? AND github_login = ?"
          )
          .get(deliveryId, githubLogin) !== undefined
      );
    },

    markSent(deliveryId, githubLogin): void {
      sql
        .prepare(
          "INSERT OR IGNORE INTO sent (delivery_id, github_login, sent_at) VALUES (?, ?, ?)"
        )
        .run(deliveryId, githubLogin, new Date().toISOString());
    },

    close(): void {
      sql.close();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/db.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/db.ts src/db.test.ts
git commit -m "feat: add sqlite storage for links and dedup"
```

---

### Task 4: `github/events.ts` — payload parsing

**Files:**
- Create: `src/github/events.ts`
- Test: `src/github/events.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseEvent } from "./events";

const pr = {
  node_id: "PR_123",
  number: 42,
  title: "Add widget",
  html_url: "https://github.com/acme/repo/pull/42",
  user: { login: "author1" },
  requested_reviewers: [{ login: "rev1" }, { login: "rev2" }],
};
const repository = { full_name: "acme/repo", owner: { login: "acme" } };

describe("parseEvent", () => {
  it("parses review_requested for an individual reviewer", () => {
    const event = parseEvent("review_requested", {
      action: "review_requested",
      pull_request: pr,
      repository,
      requested_reviewer: { login: "rev1" },
    });
    expect(event).toEqual({
      prNodeId: "PR_123",
      prNumber: 42,
      prTitle: "Add widget",
      prUrl: "https://github.com/acme/repo/pull/42",
      repoFullName: "acme/repo",
      repoOwner: "acme",
      author: "author1",
      recipients: ["rev1"],
    });
  });

  it("ignores a team review_requested (no individual reviewer)", () => {
    const event = parseEvent("review_requested", {
      action: "review_requested",
      pull_request: pr,
      repository,
      requested_team: { name: "core" },
    });
    expect(event).toBeNull();
  });

  it("parses ready_for_review using current requested reviewers", () => {
    const event = parseEvent("ready_for_review", {
      action: "ready_for_review",
      pull_request: pr,
      repository,
    });
    expect(event?.recipients).toEqual(["rev1", "rev2"]);
  });

  it("returns null for ready_for_review with no requested reviewers", () => {
    const event = parseEvent("ready_for_review", {
      action: "ready_for_review",
      pull_request: { ...pr, requested_reviewers: [] },
      repository,
    });
    expect(event).toBeNull();
  });

  it("returns null for unsupported actions", () => {
    expect(
      parseEvent("closed", { action: "closed", pull_request: pr, repository })
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/github/events.test.ts`
Expected: FAIL — cannot find module `./events`.

- [ ] **Step 3: Write minimal implementation**

```ts
export interface NotificationEvent {
  prNodeId: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  repoFullName: string;
  repoOwner: string;
  author: string;
  recipients: string[];
}

export interface PullRequestPayload {
  action: string;
  pull_request: {
    node_id: string;
    number: number;
    title: string;
    html_url: string;
    user: { login: string };
    requested_reviewers?: { login: string }[];
  };
  repository: {
    full_name: string;
    owner: { login: string };
  };
  requested_reviewer?: { login: string };
  requested_team?: { name: string };
}

function buildEvent(
  payload: PullRequestPayload,
  recipients: string[]
): NotificationEvent {
  const pr = payload.pull_request;
  return {
    prNodeId: pr.node_id,
    prNumber: pr.number,
    prTitle: pr.title,
    prUrl: pr.html_url,
    repoFullName: payload.repository.full_name,
    repoOwner: payload.repository.owner.login,
    author: pr.user.login,
    recipients,
  };
}

export function parseEvent(
  action: string,
  payload: PullRequestPayload
): NotificationEvent | null {
  if (action === "review_requested") {
    const login = payload.requested_reviewer?.login;
    return login ? buildEvent(payload, [login]) : null;
  }
  if (action === "ready_for_review") {
    const recipients = (payload.pull_request.requested_reviewers ?? []).map(
      (r) => r.login
    );
    return recipients.length > 0 ? buildEvent(payload, recipients) : null;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/github/events.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/github/events.ts src/github/events.test.ts
git commit -m "feat: parse github pull_request webhook payloads"
```

---

### Task 5: `github/webhook.ts` — signature verification & route

**Files:**
- Create: `src/github/webhook.ts`
- Test: `src/github/webhook.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { createHmac } from "crypto";
import Fastify from "fastify";
import { verifySignature, registerWebhookRoute } from "./webhook";
import type { NotificationEvent } from "./events";

const SECRET = "shhh";
const sign = (body: string) =>
  "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");

const reviewRequested = JSON.stringify({
  action: "review_requested",
  pull_request: {
    node_id: "PR_1",
    number: 7,
    title: "Fix bug",
    html_url: "https://github.com/acme/repo/pull/7",
    user: { login: "author1" },
    requested_reviewers: [],
  },
  repository: { full_name: "acme/repo", owner: { login: "acme" } },
  requested_reviewer: { login: "rev1" },
});

async function buildApp(opts: {
  allowedOwners?: string[] | null;
  onEvent?: (e: NotificationEvent, id: string) => Promise<void>;
}) {
  const app = Fastify();
  const onEvent = opts.onEvent ?? (async () => {});
  registerWebhookRoute(app, {
    secret: SECRET,
    allowedOwners: opts.allowedOwners ?? null,
    onEvent,
  });
  await app.ready();
  return app;
}

describe("verifySignature", () => {
  it("accepts a valid signature", () => {
    expect(verifySignature(SECRET, reviewRequested, sign(reviewRequested))).toBe(true);
  });
  it("rejects a wrong signature", () => {
    expect(verifySignature(SECRET, reviewRequested, "sha256=deadbeef")).toBe(false);
  });
  it("rejects a missing signature", () => {
    expect(verifySignature(SECRET, reviewRequested, undefined)).toBe(false);
  });
});

describe("POST /webhook/github", () => {
  const headers = (body: string) => ({
    "content-type": "application/json",
    "x-github-event": "pull_request",
    "x-github-delivery": "delivery-1",
    "x-hub-signature-256": sign(body),
  });

  it("401s on a bad signature without calling onEvent", async () => {
    const onEvent = vi.fn();
    const app = await buildApp({ onEvent });
    const res = await app.inject({
      method: "POST",
      url: "/webhook/github",
      headers: { ...headers(reviewRequested), "x-hub-signature-256": "sha256=bad" },
      payload: reviewRequested,
    });
    expect(res.statusCode).toBe(401);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("dispatches a valid event with the delivery id", async () => {
    const onEvent = vi.fn(async () => {});
    const app = await buildApp({ onEvent });
    const res = await app.inject({
      method: "POST",
      url: "/webhook/github",
      headers: headers(reviewRequested),
      payload: reviewRequested,
    });
    expect(res.statusCode).toBe(200);
    expect(onEvent).toHaveBeenCalledTimes(1);
    const [event, deliveryId] = onEvent.mock.calls[0];
    expect(event.recipients).toEqual(["rev1"]);
    expect(deliveryId).toBe("delivery-1");
  });

  it("ignores non pull_request events with 200", async () => {
    const onEvent = vi.fn();
    const app = await buildApp({ onEvent });
    const res = await app.inject({
      method: "POST",
      url: "/webhook/github",
      headers: { ...headers(reviewRequested), "x-github-event": "ping" },
      payload: reviewRequested,
    });
    expect(res.statusCode).toBe(200);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("ignores owners not on the allowlist with 200", async () => {
    const onEvent = vi.fn();
    const app = await buildApp({ allowedOwners: ["other"], onEvent });
    const res = await app.inject({
      method: "POST",
      url: "/webhook/github",
      headers: headers(reviewRequested),
      payload: reviewRequested,
    });
    expect(res.statusCode).toBe(200);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("500s when onEvent throws so GitHub retries", async () => {
    const onEvent = vi.fn(async () => {
      throw new Error("db down");
    });
    const app = await buildApp({ onEvent });
    const res = await app.inject({
      method: "POST",
      url: "/webhook/github",
      headers: headers(reviewRequested),
      payload: reviewRequested,
    });
    expect(res.statusCode).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/github/webhook.test.ts`
Expected: FAIL — cannot find module `./webhook`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { createHmac, timingSafeEqual } from "crypto";
import type { FastifyInstance } from "fastify";
import { parseEvent, type NotificationEvent, type PullRequestPayload } from "./events";

export function verifySignature(
  secret: string,
  payload: Buffer | string,
  signatureHeader: string | undefined
): boolean {
  if (!signatureHeader) return false;
  const expected =
    "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface WebhookOptions {
  secret: string;
  allowedOwners: string[] | null;
  onEvent: (event: NotificationEvent, deliveryId: string) => Promise<void>;
}

export function registerWebhookRoute(
  app: FastifyInstance,
  opts: WebhookOptions
): void {
  // Keep the raw body so we can HMAC-verify the exact bytes GitHub signed.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body, done) => {
      (req as unknown as { rawBody: Buffer }).rawBody = body as Buffer;
      try {
        done(null, JSON.parse((body as Buffer).toString("utf8")));
      } catch (err) {
        done(err as Error);
      }
    }
  );

  app.post("/webhook/github", async (req, reply) => {
    const raw = (req as unknown as { rawBody: Buffer }).rawBody;
    const signature = req.headers["x-hub-signature-256"] as string | undefined;
    if (!verifySignature(opts.secret, raw, signature)) {
      return reply.code(401).send({ error: "invalid signature" });
    }

    if (req.headers["x-github-event"] !== "pull_request") {
      return reply.code(200).send({ ignored: true });
    }

    const payload = req.body as PullRequestPayload;
    if (
      opts.allowedOwners &&
      !opts.allowedOwners.includes(payload.repository?.owner?.login)
    ) {
      return reply.code(200).send({ ignored: true });
    }

    const event = parseEvent(payload.action, payload);
    if (!event) {
      return reply.code(200).send({ ignored: true });
    }

    const deliveryId = req.headers["x-github-delivery"] as string;
    try {
      await opts.onEvent(event, deliveryId);
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: "processing failed" });
    }
    return reply.code(200).send({ ok: true });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/github/webhook.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/github/webhook.ts src/github/webhook.test.ts
git commit -m "feat: add webhook route with hmac verification"
```

---

### Task 6: `notifier.ts` — recipient resolution & DM dispatch

**Files:**
- Create: `src/notifier.ts`
- Test: `src/notifier.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDatabase, type Database } from "./db";
import { createNotifier, formatMessage, type DmSender } from "./notifier";
import type { NotificationEvent } from "./github/events";

const event: NotificationEvent = {
  prNodeId: "PR_1",
  prNumber: 7,
  prTitle: "Fix bug",
  prUrl: "https://github.com/acme/repo/pull/7",
  repoFullName: "acme/repo",
  repoOwner: "acme",
  author: "author1",
  recipients: ["rev1", "rev2"],
};

let db: Database;
let sent: { discordId: string; message: string }[];
let sender: DmSender;

beforeEach(() => {
  db = createDatabase(":memory:");
  sent = [];
  sender = { sendDm: async (discordId, message) => { sent.push({ discordId, message }); } };
});

describe("formatMessage", () => {
  it("includes author, repo, number, title and url", () => {
    const msg = formatMessage(event);
    expect(msg).toContain("author1");
    expect(msg).toContain("acme/repo#7");
    expect(msg).toContain("Fix bug");
    expect(msg).toContain("https://github.com/acme/repo/pull/7");
  });
});

describe("notifier", () => {
  it("DMs only linked recipients", async () => {
    db.upsertLink("discord-rev1", "rev1", null);
    const notify = createNotifier(db, sender);
    await notify(event, "delivery-1");
    expect(sent).toEqual([
      { discordId: "discord-rev1", message: formatMessage(event) },
    ]);
  });

  it("does not DM the same recipient twice for the same delivery", async () => {
    db.upsertLink("discord-rev1", "rev1", null);
    const notify = createNotifier(db, sender);
    await notify(event, "delivery-1");
    await notify(event, "delivery-1");
    expect(sent).toHaveLength(1);
  });

  it("re-notifies for a new delivery id", async () => {
    db.upsertLink("discord-rev1", "rev1", null);
    const notify = createNotifier(db, sender);
    await notify(event, "delivery-1");
    await notify(event, "delivery-2");
    expect(sent).toHaveLength(2);
  });

  it("does not mark sent when the DM fails, allowing a retry", async () => {
    db.upsertLink("discord-rev1", "rev1", null);
    const failing: DmSender = { sendDm: vi.fn(async () => { throw new Error("DMs closed"); }) };
    const notify = createNotifier(db, failing);
    await notify(event, "delivery-1"); // should not throw
    expect(db.wasSent("delivery-1", "rev1")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/notifier.test.ts`
Expected: FAIL — cannot find module `./notifier`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Database } from "./db";
import type { NotificationEvent } from "./github/events";

export interface DmSender {
  sendDm(discordId: string, message: string): Promise<void>;
}

export function formatMessage(event: NotificationEvent): string {
  return [
    `🔔 **${event.author}** requested your review`,
    `**${event.repoFullName}#${event.prNumber}** — ${event.prTitle}`,
    event.prUrl,
  ].join("\n");
}

export function createNotifier(
  db: Database,
  sender: DmSender
): (event: NotificationEvent, deliveryId: string) => Promise<void> {
  return async (event, deliveryId) => {
    const message = formatMessage(event);
    for (const login of event.recipients) {
      if (db.wasSent(deliveryId, login)) continue;
      const discordIds = db.getDiscordIdsByGithubLogin(login);
      if (discordIds.length === 0) continue;
      try {
        for (const discordId of discordIds) {
          await sender.sendDm(discordId, message);
        }
        db.markSent(deliveryId, login);
      } catch (err) {
        console.warn(`Failed to DM for ${login}:`, err);
        // Intentionally not marked sent so a redelivery can retry.
      }
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/notifier.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/notifier.ts src/notifier.test.ts
git commit -m "feat: add notifier resolving recipients and sending DMs"
```

---

### Task 7: `discord/handlers.ts` — slash command logic

**Files:**
- Create: `src/discord/handlers.ts`
- Test: `src/discord/handlers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createDatabase, type Database } from "../db";
import {
  handleLink,
  handleUnlink,
  handleStatus,
  type CommandContext,
} from "./handlers";

let db: Database;
let replies: string[];

function ctx(opts: { userId?: string; option?: string | null }): CommandContext {
  return {
    userId: opts.userId ?? "user1",
    guildId: "guild1",
    getOption: () => opts.option ?? null,
    reply: async (m: string) => { replies.push(m); },
  };
}

beforeEach(() => {
  db = createDatabase(":memory:");
  replies = [];
});

describe("/link", () => {
  it("links a valid username", async () => {
    await handleLink(ctx({ option: "octocat" }), db);
    expect(db.getLinkByDiscordId("user1")?.githubLogin).toBe("octocat");
    expect(replies[0]).toMatch(/octocat/);
  });

  it("rejects an invalid username", async () => {
    await handleLink(ctx({ option: "not a username!" }), db);
    expect(db.getLinkByDiscordId("user1")).toBeNull();
    expect(replies[0]).toMatch(/valid GitHub username/i);
  });

  it("rejects a username already linked by someone else", async () => {
    db.upsertLink("other", "octocat", null);
    await handleLink(ctx({ userId: "user1", option: "octocat" }), db);
    expect(replies[0]).toMatch(/already linked/i);
  });
});

describe("/unlink", () => {
  it("removes an existing link", async () => {
    db.upsertLink("user1", "octocat", null);
    await handleUnlink(ctx({ userId: "user1" }), db);
    expect(db.getLinkByDiscordId("user1")).toBeNull();
    expect(replies[0]).toMatch(/unlinked/i);
  });

  it("reports when there was nothing to unlink", async () => {
    await handleUnlink(ctx({ userId: "user1" }), db);
    expect(replies[0]).toMatch(/not linked/i);
  });
});

describe("/status", () => {
  it("shows the linked username", async () => {
    db.upsertLink("user1", "octocat", null);
    await handleStatus(ctx({ userId: "user1" }), db);
    expect(replies[0]).toMatch(/octocat/);
  });

  it("shows when not linked", async () => {
    await handleStatus(ctx({ userId: "user1" }), db);
    expect(replies[0]).toMatch(/not linked/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/discord/handlers.test.ts`
Expected: FAIL — cannot find module `./handlers`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Database } from "../db";

export interface CommandContext {
  userId: string;
  guildId: string | null;
  getOption(name: string): string | null;
  reply(message: string): Promise<void>;
}

// GitHub usernames: 1-39 chars, alphanumeric or single hyphens, no leading/trailing hyphen.
const GITHUB_USERNAME = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

export async function handleLink(ctx: CommandContext, db: Database): Promise<void> {
  const username = ctx.getOption("username")?.trim() ?? "";
  if (!GITHUB_USERNAME.test(username)) {
    await ctx.reply("⚠️ Please provide a valid GitHub username.");
    return;
  }
  const result = db.upsertLink(ctx.userId, username, ctx.guildId);
  if (!result.ok) {
    await ctx.reply(
      `⚠️ The GitHub username \`${username}\` is already linked by another user.`
    );
    return;
  }
  await ctx.reply(`✅ Linked you to GitHub user \`${username}\`. You'll get a DM when your review is requested.`);
}

export async function handleUnlink(ctx: CommandContext, db: Database): Promise<void> {
  const removed = db.removeLink(ctx.userId);
  await ctx.reply(
    removed ? "✅ Unlinked. You'll no longer receive review DMs." : "You're not linked to a GitHub account."
  );
}

export async function handleStatus(ctx: CommandContext, db: Database): Promise<void> {
  const link = db.getLinkByDiscordId(ctx.userId);
  await ctx.reply(
    link
      ? `You're linked to GitHub user \`${link.githubLogin}\`. If you're not getting DMs, make sure this server's members can DM you.`
      : "You're not linked. Use `/link <github-username>` to start receiving review DMs."
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/discord/handlers.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/discord/handlers.ts src/discord/handlers.test.ts
git commit -m "feat: add slash command handlers for link/unlink/status"
```

---

### Task 8: `discord/commands.ts` — command definitions & registration

**Files:**
- Create: `src/discord/commands.ts`
- Test: `src/discord/commands.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { commands } from "./commands";

describe("commands", () => {
  it("defines link, unlink and status", () => {
    const names = commands.map((c) => c.name).sort();
    expect(names).toEqual(["link", "status", "unlink"]);
  });

  it("link takes a required username string option", () => {
    const link = commands.find((c) => c.name === "link")!;
    const option = link.options?.[0] as { name: string; required: boolean; type: number };
    expect(option.name).toBe("username");
    expect(option.required).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/discord/commands.test.ts`
Expected: FAIL — cannot find module `./commands`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { REST, Routes, SlashCommandBuilder } from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your GitHub username to receive review DMs")
    .addStringOption((opt) =>
      opt.setName("username").setDescription("Your GitHub username").setRequired(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("unlink")
    .setDescription("Stop receiving review DMs")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Show which GitHub username you're linked to")
    .toJSON(),
];

export async function registerCommands(token: string, clientId: string): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/discord/commands.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/discord/commands.ts src/discord/commands.test.ts
git commit -m "feat: define and register discord slash commands"
```

---

### Task 9: `discord/client.ts` — client, DM sender, interaction adapter

**Files:**
- Create: `src/discord/client.ts`

This task is integration wiring against the discord.js library (a live gateway connection and the real `Interaction` shape), so it is verified by typecheck/build rather than a unit test — the testable logic already lives in `handlers.ts` (Task 7).

- [ ] **Step 1: Write the implementation**

```ts
import {
  Client,
  GatewayIntentBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Database } from "../db";
import type { DmSender } from "../notifier";
import {
  handleLink,
  handleUnlink,
  handleStatus,
  type CommandContext,
} from "./handlers";

function toContext(interaction: ChatInputCommandInteraction): CommandContext {
  return {
    userId: interaction.user.id,
    guildId: interaction.guildId,
    getOption: (name) => interaction.options.getString(name),
    reply: async (message) => {
      await interaction.reply({ content: message, ephemeral: true });
    },
  };
}

export interface DiscordRuntime {
  client: Client;
  sender: DmSender;
}

export async function startDiscord(
  token: string,
  db: Database
): Promise<DiscordRuntime> {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const ctx = toContext(interaction);
    try {
      if (interaction.commandName === "link") await handleLink(ctx, db);
      else if (interaction.commandName === "unlink") await handleUnlink(ctx, db);
      else if (interaction.commandName === "status") await handleStatus(ctx, db);
    } catch (err) {
      console.error("Command handler error:", err);
      if (!interaction.replied) {
        await interaction.reply({ content: "Something went wrong.", ephemeral: true });
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

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: exits 0 with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/discord/client.ts
git commit -m "feat: add discord client, DM sender, and interaction adapter"
```

---

### Task 10: `index.ts` — wire everything together

**Files:**
- Modify: `src/index.ts` (replace the Task 1 placeholder)

This is the composition root: it constructs every module and starts both surfaces. Verified by typecheck/build and a manual smoke run.

- [ ] **Step 1: Replace `src/index.ts`**

```ts
import Fastify from "fastify";
import { loadConfig } from "./config";
import { createDatabase } from "./db";
import { registerCommands } from "./discord/commands";
import { startDiscord } from "./discord/client";
import { registerWebhookRoute } from "./github/webhook";
import { createNotifier } from "./notifier";

async function main() {
  const config = loadConfig(process.env);
  const db = createDatabase(config.databasePath);

  await registerCommands(config.discordToken, config.discordClientId);
  const { sender } = await startDiscord(config.discordToken, db);

  const notify = createNotifier(db, sender);

  const app = Fastify({ logger: true });
  app.get("/health", async () => ({ ok: true }));
  registerWebhookRoute(app, {
    secret: config.githubWebhookSecret,
    allowedOwners: config.allowedOwners,
    onEvent: notify,
  });

  await app.listen({ host: "0.0.0.0", port: config.port });

  const shutdown = async () => {
    await app.close();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify build and full test suite**

Run: `npm run build && npm test`
Expected: `tsc` produces `dist/` with no errors; all vitest suites pass (config, db, events, webhook, notifier, handlers, commands).

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire gateway and webhook server together"
```

---

### Task 11: Deployment — Dockerfile, README, ignore files

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `README.md`

- [ ] **Step 1: Create `Dockerfile`**

```dockerfile
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Create `.dockerignore`**

```
node_modules
dist
.env
.env.*
*.sqlite
*.db
data
.git
```

- [ ] **Step 3: Create `README.md`**

````markdown
# Discord GitHub PR Review Notifier

DMs you on Discord when your review is requested on a GitHub pull request.

## How it works

A single Node service runs a Discord bot (slash commands) and a Fastify webhook
receiver. Add the webhook to a repo or org; when GitHub requests someone's
review, the bot DMs the Discord user linked to that GitHub username.

## Setup

1. **Create a Discord application & bot** at <https://discord.com/developers>.
   Copy the bot token and application (client) ID. Invite the bot to your server
   with the `applications.commands` and `bot` scopes.
2. **Configure environment** — copy `.env.example` to `.env` and fill in:
   - `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`
   - `GITHUB_WEBHOOK_SECRET` (any long random string)
   - `DATABASE_PATH` (e.g. `/data/bot.sqlite` on a persistent volume)
   - `PORT`
   - optional `ALLOWED_OWNERS` (comma-separated orgs/users)
3. **Deploy** to Railway / Fly / Render as a single service with a persistent
   volume mounted at the directory of `DATABASE_PATH`. Note the public HTTPS URL.
4. **Add the GitHub webhook** on each repo (or org), Settings → Webhooks → Add:
   - Payload URL: `https://<your-host>/webhook/github`
   - Content type: `application/json`
   - Secret: the same value as `GITHUB_WEBHOOK_SECRET`
   - Events: "Let me select individual events" → **Pull requests**

## Usage

In Discord:

- `/link <github-username>` — start receiving review DMs
- `/unlink` — stop
- `/status` — see what you're linked to

## Development

```bash
npm install
npm test          # run the test suite
npm run dev       # run locally (use a tunnel like cloudflared to receive webhooks)
```
````

- [ ] **Step 4: Verify the image builds**

Run: `docker build -t discord-github-pr .`
Expected: build completes successfully through both stages.
(If Docker is unavailable in the environment, skip this step and note it.)

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore README.md
git commit -m "chore: add Dockerfile, dockerignore, and README"
```

---

## Self-Review Notes

- **Spec coverage:** config (Task 2), SQLite links + dedup schema (Task 3),
  event parsing for `review_requested`/`ready_for_review`/re-review (Task 4),
  HMAC verification + `ALLOWED_OWNERS` + error-status mapping (Task 5), recipient
  resolution + DM + dedup-on-delivery-id (Task 6), `/link` `/unlink` `/status`
  (Task 7-8), gateway + webhook composition (Task 9-10), deployment + operator
  webhook setup notes (Task 11). All spec sections map to a task.
- **Re-review behavior:** handled implicitly — a re-review is a fresh
  `review_requested` event with a new `X-GitHub-Delivery` id, so dedup (keyed on
  delivery id) lets it through. Covered by the "re-notifies for a new delivery
  id" test in Task 6.
- **Type consistency:** `NotificationEvent`/`PullRequestPayload` defined in
  `github/events.ts` and imported everywhere; `DmSender` defined in `notifier.ts`
  and implemented in `discord/client.ts`; `CommandContext` defined in
  `discord/handlers.ts` and adapted in `discord/client.ts`; `Database`/`Link`/
  `UpsertResult` defined in `db.ts`. Names match across tasks.
