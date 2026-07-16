import { EmbedBuilder } from "discord.js";
import { TONE } from "../messages/tone";
import type { OctoMessage } from "../notifier";

// The single place OctoMessage meets discord.js. Note there is no setTimestamp():
// embed footers don't parse <t:UNIX:R>, so relative time lives in the description.
export function renderEmbed(message: OctoMessage, mascotBaseUrl: string): EmbedBuilder {
  const tone = TONE[message.tone];
  return new EmbedBuilder()
    .setColor(message.color ?? tone.color)
    .setTitle(message.title)
    .setDescription(message.body)
    .setThumbnail(`${mascotBaseUrl}/${tone.image}`)
    .setFooter({ text: "OctoBot" });
}
