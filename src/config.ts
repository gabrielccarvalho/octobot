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

  const owners = (env.ALLOWED_OWNERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowedOwners = owners.length > 0 ? owners : null;

  return {
    discordToken: env.DISCORD_TOKEN!.trim(),
    discordClientId: env.DISCORD_CLIENT_ID!.trim(),
    githubWebhookSecret: env.GITHUB_WEBHOOK_SECRET!.trim(),
    databasePath: env.DATABASE_PATH!.trim(),
    port,
    allowedOwners,
  };
}
