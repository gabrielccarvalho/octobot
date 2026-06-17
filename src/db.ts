import SQLite from "better-sqlite3";

export interface Link {
  discordId: string;
  githubLogin: string;
  guildId: string | null;
  createdAt: string;
}

export interface User {
  discordId: string;
  githubLogin: string;
  tokenCiphertext: string;
  tokenIv: string;
  tokenTag: string;
  lastModified: string | null;
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
  upsertUser(discordId: string, githubLogin: string, enc: { ciphertext: string; iv: string; tag: string }): void;
  getUser(discordId: string): User | null;
  getAllUsers(): User[];
  deleteUser(discordId: string): boolean;
  updateLastModified(discordId: string, lastModified: string): void;
  wasNotified(discordId: string, threadId: string, updatedAt: string): boolean;
  markNotified(discordId: string, threadId: string, updatedAt: string): void;
  createState(state: string, discordId: string): void;
  consumeState(state: string, maxAgeMs: number): string | null;
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
      let result: UpsertResult = { ok: true };
      sql.transaction(() => {
        const owner = sql
          .prepare("SELECT discord_id FROM links WHERE github_login = ?")
          .get(githubLogin) as { discord_id: string } | undefined;
        if (owner && owner.discord_id !== discordId) {
          result = { ok: false, reason: "github_login_taken" };
          return;
        }
        sql.prepare("DELETE FROM links WHERE discord_id = ?").run(discordId);
        sql
          .prepare(
            "INSERT INTO links (discord_id, github_login, guild_id, created_at) VALUES (?, ?, ?, ?)"
          )
          .run(discordId, githubLogin, guildId, new Date().toISOString());
      })();
      return result;
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
          .prepare(
            "SELECT discord_id, github_login, guild_id, created_at FROM links WHERE discord_id = ?"
          )
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

    close(): void {
      sql.close();
    },
  };
}
