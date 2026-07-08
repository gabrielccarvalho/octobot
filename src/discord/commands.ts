import { REST, Routes, SlashCommandBuilder } from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("digest")
    .setDescription("Turn the daily 6am PR digest on or off, or preview it")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Connect your GitHub account to receive PR notifications")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("unlink")
    .setDescription("Disconnect your GitHub account and stop notifications")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Show which GitHub account you're connected as")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("listen-to")
    .setDescription("Choose which GitHub notifications you receive")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("connect-token")
    .setDescription("Connect with a GitHub token (for orgs that restrict OAuth apps)")
    .toJSON(),
];

export async function registerCommands(token: string, clientId: string): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
}
