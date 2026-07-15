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
