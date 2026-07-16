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

  it("defaults mascotBaseUrl when MASCOT_BASE_URL is unset", () => {
    expect(loadConfig(base).mascotBaseUrl).toBe("https://octobot.dev/mascot");
  });

  it("overrides mascotBaseUrl and strips trailing slashes", () => {
    const cfg = loadConfig({ ...base, MASCOT_BASE_URL: "https://cdn.example.com/art///" });
    expect(cfg.mascotBaseUrl).toBe("https://cdn.example.com/art");
  });

  it("falls back to the default when MASCOT_BASE_URL is blank", () => {
    expect(loadConfig({ ...base, MASCOT_BASE_URL: "   " }).mascotBaseUrl).toBe(
      "https://octobot.dev/mascot"
    );
  });
});
