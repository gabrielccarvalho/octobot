import {
  Client,
  GatewayIntentBits,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import type { Database } from "../db";
import type { DmSender } from "../notifier";
import {
  handleLink,
  handleUnlink,
  handleStatus,
  subjectOptions,
  reasonOptions,
  applySubjectSelection,
  applyReasonSelection,
  LISTEN_TO_SUBJECTS_ID,
  LISTEN_TO_REASONS_ID,
  type CommandContext,
  type LinkDeps,
  type StatusDeps,
  type SubscriptionOption,
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

  const menuRow = (customId: string, placeholder: string, options: SubscriptionOption[]) =>
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(placeholder)
        .setMinValues(0)
        .setMaxValues(options.length)
        .addOptions(options.map((o) => ({ label: o.label, value: o.value, default: o.default })))
    );

  const listenToComponents = (userId: string) => [
    menuRow(LISTEN_TO_SUBJECTS_ID, "Subject types to receive", subjectOptions(db, userId)),
    menuRow(LISTEN_TO_REASONS_ID, "Reasons to receive", reasonOptions(db, userId)),
  ];

  const handleListenToSelect = async (interaction: StringSelectMenuInteraction) => {
    const userId = interaction.user.id;
    if (interaction.customId === LISTEN_TO_SUBJECTS_ID) {
      applySubjectSelection(db, userId, interaction.values);
    } else if (interaction.customId === LISTEN_TO_REASONS_ID) {
      applyReasonSelection(db, userId, interaction.values);
    } else {
      return;
    }
    await interaction.update({
      content: "🎚️ **Saved.** Adjust anytime — changes save automatically.",
      components: listenToComponents(userId),
    });
  };

  client.on("interactionCreate", async (interaction) => {
    if (interaction.isStringSelectMenu()) {
      try {
        await handleListenToSelect(interaction);
      } catch (err) {
        console.error("Select menu handler error:", err);
      }
      return;
    }
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
      } else if (interaction.commandName === "listen-to") {
        if (!db.getUser(interaction.user.id)) {
          await interaction.reply({
            content: "You're not connected. Run `/link` first.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await interaction.reply({
          content: "🎚️ **Choose what to be notified about.** Changes save automatically.",
          components: listenToComponents(interaction.user.id),
          flags: MessageFlags.Ephemeral,
        });
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
