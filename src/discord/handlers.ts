import type { Database, User } from "../db";
import { formatAttention, type AttentionList } from "../status";
import { SUBJECT_TYPES, REASONS } from "../github/taxonomy";

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

export interface StatusDeps {
  listAttention(user: User): Promise<AttentionList>;
}

export interface SubscriptionOption {
  label: string;
  value: string;
  default: boolean;
}

export const LISTEN_TO_SUBJECTS_ID = "listen-to:subjects";
export const LISTEN_TO_REASONS_ID = "listen-to:reasons";

export function subjectOptions(db: Database, userId: string): SubscriptionOption[] {
  const { subjects } = db.getSubscriptions(userId);
  return SUBJECT_TYPES.map((s) => ({
    label: `${s.emoji} ${s.label}`,
    value: s.key,
    default: subjects.has(s.key),
  }));
}

export function reasonOptions(db: Database, userId: string): SubscriptionOption[] {
  const { reasons } = db.getSubscriptions(userId);
  return REASONS.map((r) => ({
    label: `${r.emoji} ${r.label}`,
    value: r.key,
    default: reasons === null || reasons.has(r.key),
  }));
}

export function applySubjectSelection(db: Database, userId: string, values: string[]): void {
  db.setSubscribedSubjects(userId, values);
}

export function applyReasonSelection(db: Database, userId: string, values: string[]): void {
  db.setSubscribedReasons(userId, values);
}

export const DIGEST_TOGGLE_ID = "digest:toggle";
export const DIGEST_PREVIEW_ID = "digest:preview";

export function toggleDigest(db: Database, userId: string): boolean {
  const next = !db.getDigestEnabled(userId);
  db.setDigestEnabled(userId, next);
  return next;
}

export function digestStatusText(enabled: boolean): string {
  return enabled
    ? "☀️ Daily PR digest is **ON** — you'll get a summary at 6am BRT."
    : "🌙 Daily PR digest is **OFF**.";
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

  try {
    const list = await deps.listAttention(user);
    await ctx.reply(formatAttention(user.githubLogin, list));
  } catch (err) {
    const status = (err as { status?: number }).status;
    const note =
      status === 401
        ? "Your GitHub connection expired — run `/link` to reconnect."
        : "Couldn't reach GitHub right now — try again in a moment.";
    await ctx.reply(`✅ Connected as \`${user.githubLogin}\`\n\n${note}`);
  }
}
