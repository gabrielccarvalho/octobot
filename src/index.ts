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
