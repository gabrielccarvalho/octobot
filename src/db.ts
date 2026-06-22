import SQLite from "better-sqlite3";
import { DEFAULT_SUBJECT_KEYS } from "./github/taxonomy";

export interface User {
  discordId: string;
  githubLogin: string;
  tokenCiphertext: string;
  tokenIv: string;
  tokenTag: string;
  lastModified: string | null;
  createdAt: string;
}

export interface Database {
  upsertUser(discordId: string, githubLogin: string, enc: { ciphertext: string; iv: string; tag: string }): void;
  getUser(discordId: string): User | null;
  getAllUsers(): User[];
  deleteUser(discordId: string): boolean;
  updateLastModified(discordId: string, lastModified: string): void;
  wasNotified(discordId: string, threadId: string, updatedAt: string): boolean;
  markNotified(discordId: string, threadId: string, updatedAt: string): void;
  createState(state: string, discordId: string): void;
  consumeState(state: string, maxAgeMs: number): string | null;
  getSubscriptions(discordId: string): { subjects: Set<string>; reasons: Set<string> | null };
  setSubscribedSubjects(discordId: string, subjects: string[]): void;
  setSubscribedReasons(discordId: string, reasons: string[]): void;
  getDigestEnabled(discordId: string): boolean;
  setDigestEnabled(discordId: string, enabled: boolean): void;
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  close(): void;
}

export function createDatabase(path: string): Database {
  const sql = new SQLite(path);
  sql.pragma("journal_mode = WAL");
  sql.exec(`
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

  // Idempotent migration: subscription columns added after initial release.
  const userCols = sql.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  const hasCol = (c: string) => userCols.some((x) => x.name === c);
  if (!hasCol("subscribed_subjects")) sql.exec("ALTER TABLE users ADD COLUMN subscribed_subjects TEXT");
  if (!hasCol("subscribed_reasons")) sql.exec("ALTER TABLE users ADD COLUMN subscribed_reasons TEXT");
  if (!hasCol("digest_enabled")) sql.exec("ALTER TABLE users ADD COLUMN digest_enabled INTEGER");
  sql.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  return {
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

    getSubscriptions(discordId): { subjects: Set<string>; reasons: Set<string> | null } {
      const r = sql
        .prepare("SELECT subscribed_subjects, subscribed_reasons FROM users WHERE discord_id = ?")
        .get(discordId) as
        | { subscribed_subjects: string | null; subscribed_reasons: string | null }
        | undefined;
      const subjects = r?.subscribed_subjects
        ? new Set(JSON.parse(r.subscribed_subjects) as string[])
        : new Set(DEFAULT_SUBJECT_KEYS);
      const reasons = r?.subscribed_reasons
        ? new Set(JSON.parse(r.subscribed_reasons) as string[])
        : null;
      return { subjects, reasons };
    },

    setSubscribedSubjects(discordId, subjects): void {
      sql
        .prepare("UPDATE users SET subscribed_subjects = ? WHERE discord_id = ?")
        .run(JSON.stringify(subjects), discordId);
    },

    setSubscribedReasons(discordId, reasons): void {
      sql
        .prepare("UPDATE users SET subscribed_reasons = ? WHERE discord_id = ?")
        .run(JSON.stringify(reasons), discordId);
    },

    getDigestEnabled(discordId): boolean {
      const r = sql
        .prepare("SELECT digest_enabled FROM users WHERE discord_id = ?")
        .get(discordId) as { digest_enabled: number | null } | undefined;
      if (!r) return false; // unknown user
      return r.digest_enabled !== 0; // NULL (never set) => ON
    },

    setDigestEnabled(discordId, enabled): void {
      sql
        .prepare("UPDATE users SET digest_enabled = ? WHERE discord_id = ?")
        .run(enabled ? 1 : 0, discordId);
    },

    getMeta(key): string | null {
      const r = sql.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
        | { value: string }
        | undefined;
      return r ? r.value : null;
    },

    setMeta(key, value): void {
      sql.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(key, value);
    },

    close(): void {
      sql.close();
    },
  };
}
