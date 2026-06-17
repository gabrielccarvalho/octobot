import {
  Client,
  GatewayIntentBits,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Database } from "../db";
import type { DmSender } from "../notifier";
import {
  handleLink,
  handleUnlink,
  handleStatus,
  type CommandContext,
  type LinkDeps,
  type StatusDeps,
} from "./handlers";

function toContext(interaction: ChatInputCommandInteraction): CommandContext {
  return {
    userId: interaction.user.id,
    guildId: interaction.guildId,
    getOption: (name) => interaction.options.getString(name),
    reply: async (message) => {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: message });
      } else {
        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
      }
    },
  };
}

export interface DiscordRuntime {
  client: Client;
  sender: DmSender;
}

export async function startDiscord(
  token: string,
  db: Database,
  linkDeps: LinkDeps,
  statusDeps: StatusDeps
): Promise<DiscordRuntime> {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const ctx = toContext(interaction);
    try {
      if (interaction.commandName === "link") {
        await handleLink(ctx, db, linkDeps);
      } else if (interaction.commandName === "unlink") {
        await handleUnlink(ctx, db);
      } else if (interaction.commandName === "status") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await handleStatus(ctx, db, statusDeps);
      }
    } catch (err) {
      console.error("Command handler error:", err);
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: "Something went wrong.", flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: "Something went wrong.", flags: MessageFlags.Ephemeral });
        }
      } catch (replyErr) {
        console.error("Failed to send error reply:", replyErr);
      }
    }
  });

  const sender: DmSender = {
    async sendDm(discordId, message) {
      const user = await client.users.fetch(discordId);
      await user.send(message);
    },
  };

  await client.login(token);
  return { client, sender };
}
