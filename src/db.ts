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
