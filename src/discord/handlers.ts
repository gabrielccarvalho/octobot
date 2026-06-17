import type { Database, User } from "../db";
import type { PrSummary } from "../github/search";

export interface CommandContext {
  userId: string;
  guildId: string | null;
  getOption(name: string): string | null;
  reply(message: string): Promise<void>;
}

export interface LinkDeps {
  generateState(): string;
  authorizeUrl(state: string): string;
}

export interface AttentionList {
  incoming: PrSummary[];
  mine: PrSummary[];
}

export interface StatusDeps {
  listAttention(user: User): Promise<AttentionList>;
}

export async function handleLink(ctx: CommandContext, db: Database, deps: LinkDeps): Promise<void> {
  const state = deps.generateState();
  db.createState(state, ctx.userId);
  await ctx.reply(
    `🔗 Connect your GitHub account to receive PR notifications:\n${deps.authorizeUrl(state)}\n\nThis link is personal — don't share it. It expires shortly.`
  );
}

export async function handleUnlink(ctx: CommandContext, db: Database): Promise<void> {
  const removed = db.deleteUser(ctx.userId);
  await ctx.reply(
    removed ? "✅ Disconnected. You'll no longer receive notifications." : "You're not connected."
  );
}

const MAX_PER_SECTION = 10;
const MAX_TITLE = 59;
const MAX_MESSAGE = 2000;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function clampMessage(message: string): string {
  return message.length > MAX_MESSAGE ? `${message.slice(0, MAX_MESSAGE - 1)}…` : message;
}

// Discord renders <t:UNIX:R> as a localized, auto-updating "5 minutes ago".
function relativeTime(iso: string): string {
  return `<t:${Math.floor(new Date(iso).getTime() / 1000)}:R>`;
}

// Group PRs by repo, preserving first-seen order of both repos and PRs.
function groupByRepo(prs: PrSummary[]): { repo: string; prs: PrSummary[] }[] {
  const groups: { repo: string; prs: PrSummary[] }[] = [];
  const index = new Map<string, PrSummary[]>();
  for (const pr of prs) {
    let bucket = index.get(pr.repoFullName);
    if (!bucket) {
      bucket = [];
      index.set(pr.repoFullName, bucket);
      groups.push({ repo: pr.repoFullName, prs: bucket });
    }
    bucket.push(pr);
  }
  return groups;
}

function renderSection(label: string, prs: PrSummary[], emptyLine: string): string {
  if (prs.length === 0) return `${label}\n${emptyLine}`;
  const blocks = groupByRepo(prs.slice(0, MAX_PER_SECTION)).map((group) => {
    const lines = group.prs
      .map(
        (p) => `#${p.number} [${truncate(p.title, MAX_TITLE)}](${p.url}) · ${relativeTime(p.updatedAt)}`
      )
      .join("\n");
    return `**${group.repo}**\n${lines}`;
  });
  const more = prs.length > MAX_PER_SECTION ? `\n…and ${prs.length - MAX_PER_SECTION} more` : "";
  return `${label} (${prs.length})\n${blocks.join("\n")}${more}`;
}

export async function handleStatus(
  ctx: CommandContext,
  db: Database,
  deps: StatusDeps
): Promise<void> {
  const user = db.getUser(ctx.userId);
  if (!user) {
    await ctx.reply("You're not connected. Run `/link` to connect your GitHub account.");
    return;
  }

  const header = `✅ Connected as \`${user.githubLogin}\``;

  let list: AttentionList;
  try {
    list = await deps.listAttention(user);
  } catch (err) {
    const status = (err as { status?: number }).status;
    const note =
      status === 401
        ? "Your GitHub connection expired — run `/link` to reconnect."
        : "Couldn't reach GitHub right now — try again in a moment.";
    await ctx.reply(`${header}\n\n${note}`);
    return;
  }

  const incoming = renderSection(
    "🔍 Awaiting your review",
    list.incoming,
    "Nothing awaiting your review. 🎉"
  );
  const mine = renderSection(
    "📝 Your PRs awaiting review",
    list.mine,
    "No open PRs of yours are waiting on a review."
  );
  await ctx.reply(clampMessage(`${header}\n\n${incoming}\n\n${mine}`));
}
