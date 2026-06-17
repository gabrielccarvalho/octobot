import { REST, Routes, SlashCommandBuilder } from "discord.js";

export const commands = [
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
];

export async function registerCommands(token: string, clientId: string): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
}
