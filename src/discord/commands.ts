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
