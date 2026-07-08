import {
  Client,
  GatewayIntentBits,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import type { Database } from "../db";
import type { DmSender } from "../notifier";
import { buildDigest, type DigestDeps } from "../digest";
import {
  handleLink,
  handleUnlink,
  handleStatus,
  subjectOptions,
  reasonOptions,
  applySubjectSelection,
  applyReasonSelection,
  toggleDigest,
  digestStatusText,
  LISTEN_TO_SUBJECTS_ID,
  LISTEN_TO_REASONS_ID,
  DIGEST_TOGGLE_ID,
  DIGEST_PREVIEW_ID,
  handleTokenSubmit,
  CONNECT_TOKEN_CREATE_URL,
  CONNECT_TOKEN_MESSAGE,
  CONNECT_TOKEN_PASTE_ID,
  CONNECT_TOKEN_MODAL_ID,
  CONNECT_TOKEN_INPUT_ID,
  type CommandContext,
  type LinkDeps,
  type StatusDeps,
  type SubscriptionOption,
  type TokenDeps,
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
  statusDeps: StatusDeps,
  digestDeps: DigestDeps,
  tokenDeps: TokenDeps
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

  const digestButtons = (enabled: boolean) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(DIGEST_TOGGLE_ID)
        .setLabel(enabled ? "Turn off" : "Turn on")
        .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(DIGEST_PREVIEW_ID)
        .setLabel("Preview now")
        .setStyle(ButtonStyle.Secondary)
    );

  const connectTokenComponents = () => [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("Create token on GitHub")
        .setStyle(ButtonStyle.Link)
        .setURL(CONNECT_TOKEN_CREATE_URL),
      new ButtonBuilder()
        .setCustomId(CONNECT_TOKEN_PASTE_ID)
        .setLabel("Paste my token")
        .setStyle(ButtonStyle.Primary)
    ),
  ];

  const tokenModal = () =>
    new ModalBuilder()
      .setCustomId(CONNECT_TOKEN_MODAL_ID)
      .setTitle("Connect with a GitHub token")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(CONNECT_TOKEN_INPUT_ID)
            .setLabel("Paste your personal access token")
            .setPlaceholder("ghp_…")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

  const handleTokenModal = async (interaction: ModalSubmitInteraction) => {
    if (interaction.customId !== CONNECT_TOKEN_MODAL_ID) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const raw = interaction.fields.getTextInputValue(CONNECT_TOKEN_INPUT_ID);
    const message = await handleTokenSubmit(interaction.user.id, raw, db, tokenDeps);
    await interaction.editReply({ content: message });
  };

  const handleDigestButton = async (interaction: ButtonInteraction) => {
    const userId = interaction.user.id;
    if (interaction.customId === DIGEST_TOGGLE_ID) {
      if (!db.getUser(userId)) {
        await interaction.update({
          content: "You're not connected. Run `/link` first.",
          components: [],
        });
        return;
      }
      const enabled = toggleDigest(db, userId);
      await interaction.update({
        content: digestStatusText(enabled),
        components: [digestButtons(enabled)],
      });
    } else if (interaction.customId === DIGEST_PREVIEW_ID) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const user = db.getUser(userId);
      const message = user ? await buildDigest(digestDeps, user) : null;
      await interaction.editReply(
        message ?? "Nothing to show right now — no PRs need your attention. 🎉"
      );
    }
  };

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
    if (interaction.isModalSubmit()) {
      try {
        await handleTokenModal(interaction);
      } catch (err) {
        console.error("Modal submit handler error:", err);
      }
      return;
    }
    if (interaction.isButton()) {
      try {
        if (interaction.customId === CONNECT_TOKEN_PASTE_ID) {
          await interaction.showModal(tokenModal());
        } else {
          await handleDigestButton(interaction);
        }
      } catch (err) {
        console.error("Button handler error:", err);
      }
      return;
    }
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
      } else if (interaction.commandName === "connect-token") {
        await interaction.reply({
          content: CONNECT_TOKEN_MESSAGE,
          components: connectTokenComponents(),
          flags: MessageFlags.Ephemeral,
        });
      } else if (interaction.commandName === "unlink") {
        await handleUnlink(ctx, db);
      } else if (interaction.commandName === "status") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await handleStatus(ctx, db, statusDeps);
      } else if (interaction.commandName === "digest") {
        if (!db.getUser(interaction.user.id)) {
          await interaction.reply({
            content: "You're not connected. Run `/link` first.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        const enabled = db.getDigestEnabled(interaction.user.id);
        await interaction.reply({
          content: digestStatusText(enabled),
          components: [digestButtons(enabled)],
          flags: MessageFlags.Ephemeral,
        });
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
