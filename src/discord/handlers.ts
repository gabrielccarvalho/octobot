import type { Database } from "../db";

export interface CommandContext {
  userId: string;
  guildId: string | null;
  getOption(name: string): string | null;
  reply(message: string): Promise<void>;
}

// GitHub usernames: 1-39 chars, alphanumeric or single hyphens, no leading/trailing hyphen.
const GITHUB_USERNAME = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

export async function handleLink(ctx: CommandContext, db: Database): Promise<void> {
  const username = ctx.getOption("username")?.trim() ?? "";
  if (!GITHUB_USERNAME.test(username)) {
    await ctx.reply("⚠️ Please provide a valid GitHub username.");
    return;
  }
  const result = db.upsertLink(ctx.userId, username, ctx.guildId);
  if (!result.ok) {
    await ctx.reply(
      `⚠️ The GitHub username \`${username}\` is already linked by another user.`
    );
    return;
  }
  await ctx.reply(`✅ Linked you to GitHub user \`${username}\`. You'll get a DM when your review is requested.`);
}

export async function handleUnlink(ctx: CommandContext, db: Database): Promise<void> {
  const removed = db.removeLink(ctx.userId);
  await ctx.reply(
    removed ? "✅ Unlinked. You'll no longer receive review DMs." : "You're not linked to a GitHub account."
  );
}

export async function handleStatus(ctx: CommandContext, db: Database): Promise<void> {
  const link = db.getLinkByDiscordId(ctx.userId);
  await ctx.reply(
    link
      ? `You're linked to GitHub user \`${link.githubLogin}\`. If you're not getting DMs, make sure this server's members can DM you.`
      : "You're not linked. Use \`/link <github-username>\` to start receiving review DMs."
  );
}
