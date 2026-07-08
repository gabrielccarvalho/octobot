import type { Database, User } from "../db";
import { formatAttention, reconnectHint, type AttentionList } from "../status";
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

export const CONNECT_TOKEN_CREATE_URL =
  "https://github.com/settings/tokens/new?scopes=repo,notifications&description=discord-pr-bot";
export const CONNECT_TOKEN_PASTE_ID = "connect-token:paste";
export const CONNECT_TOKEN_MODAL_ID = "connect-token:modal";
export const CONNECT_TOKEN_INPUT_ID = "connect-token:input";

export const CONNECT_TOKEN_MESSAGE =
  "🔑 **Connect with a Personal Access Token** (works even when your org restricts OAuth apps).\n\n" +
  "1. Click **Create token on GitHub** below — the scopes (`repo`, `notifications`) are pre-selected.\n" +
  "2. Pick an expiration, click **Generate token**, and copy it.\n" +
  "3. Click **Paste my token** and paste it in. Your token is stored encrypted and never shown in this channel.";

export interface TokenDeps {
  validateToken(token: string): Promise<{ login: string; scopes: string[] }>;
  encrypt(token: string): { ciphertext: string; iv: string; tag: string };
  onConnect(discordId: string, token: string, githubLogin: string): Promise<void>;
}

const REQUIRED_PAT_SCOPES = ["repo", "notifications"] as const;

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
        ? `Your GitHub connection expired. ${reconnectHint(user.authSource)}`
        : "Couldn't reach GitHub right now — try again in a moment.";
    await ctx.reply(`✅ Connected as \`${user.githubLogin}\`\n\n${note}`);
  }
}

export async function handleTokenSubmit(
  userId: string,
  rawToken: string,
  db: Database,
  deps: TokenDeps
): Promise<string> {
  const token = rawToken.trim();
  if (!token) return "No token received. Run `/connect-token` and paste your token to try again.";

  let result: { login: string; scopes: string[] };
  try {
    result = await deps.validateToken(token);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) {
      return "That token is invalid or expired — create a new one and try again.";
    }
    return "Couldn't reach GitHub to verify that token — try again in a moment.";
  }

  const missing = REQUIRED_PAT_SCOPES.filter((s) => !result.scopes.includes(s));
  if (missing.length > 0) {
    return (
      `That token is missing the \`${missing.join("` and `")}\` scope` +
      `${missing.length > 1 ? "s" : ""}. Regenerate it with \`repo\` and \`notifications\` checked, then run \`/connect-token\` again.`
    );
  }

  db.upsertUser(userId, result.login, deps.encrypt(token), "pat");
  try {
    await deps.onConnect(userId, token, result.login);
  } catch (err) {
    console.warn(`Onboarding after /connect-token failed for ${userId}:`, err);
  }
  return `✅ Connected as \`${result.login}\` via personal access token.`;
}
