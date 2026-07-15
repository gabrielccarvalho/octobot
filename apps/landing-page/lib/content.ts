/**
 * Central content for the OctoBot marketing site.
 * Product facts are sourced from the discord-github-pr service README — do not
 * invent capabilities here.
 */

// --- Site-wide constants -----------------------------------------------------

/** Discord install / OAuth authorization URL for the OctoBot application. */
export const DISCORD_INVITE_URL =
  "https://discord.com/oauth2/authorize?client_id=1526667638455926794"
/**
 * Community server invite. This is the primary activation path: joining puts
 * the user in a server with OctoBot, giving them the mutual guild required to
 * DM the bot and receive its notifications.
 */
export const DISCORD_COMMUNITY_URL = "https://discord.gg/dfJPuhDGu6"
export const CONTACT_EMAIL = "gabrielccarvalhopro@gmail.com"

// --- Open source -------------------------------------------------------------

/** Public source repository. OctoBot is MIT-licensed and open source. */
export const GITHUB_REPO_URL = "https://github.com/gabrielccarvalho/octobot"
export const GITHUB_ISSUES_URL = `${GITHUB_REPO_URL}/issues`
export const GITHUB_CONTRIBUTING_URL = `${GITHUB_REPO_URL}/blob/main/CONTRIBUTING.md`

export const OPEN_SOURCE = {
  eyebrow: "Open source",
  title: "Don't trust it — read it",
  body: "OctoBot holds a token that can read your repositories. So every line that touches that token is public. Read it, audit it, or send a patch.",
  points: ["MIT-licensed", "Read-only access", "Self-auditable"],
  cta: "Star on GitHub",
} as const

/** Brand / short name used throughout the copy. */
export const COMPANY_NAME = "OctoBot"
/** Registered entity behind OctoBot. */
export const COMPANY_LEGAL_NAME = "GABRIEL CAMPOS DOS SANTOS P DE CARVALHO LTDA"
export const COMPANY_CNPJ = "58.378.419/0001-61"
/** Governing law and venue (foro) for the Terms. */
export const GOVERNING_LAW = "the Federative Republic of Brazil"
export const JURISDICTION_FORUM = "the Comarca de São Paulo/SP"

export const LAST_UPDATED = "July 14, 2026"

export const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how" },
  { label: "Commands", href: "#commands" },
  { label: "FAQ", href: "#faq" },
] as const

// --- Hero DM stream (the signature artifact) --------------------------------

export type DmMessage = {
  reason: string // emoji + label prefix
  repo: string
  time: string
  title: string
  number: string
  tone?: "default" | "approved" | "changes"
}

export const HERO_MESSAGES: DmMessage[] = [
  {
    reason: "🔔 Review requested",
    repo: "acme/api",
    time: "5 minutes ago",
    number: "#128",
    title: "Add rate limiting",
  },
  {
    reason: "✅ Your PR was approved",
    repo: "acme/web",
    time: "2 minutes ago",
    number: "#61",
    title: "Dark mode",
    tone: "approved",
  },
  {
    reason: "📣 Mentioned",
    repo: "acme/infra",
    time: "just now",
    number: "#402",
    title: "Bump node to 22 in CI",
  },
  {
    reason: "🔧 Changes requested on your PR",
    repo: "acme/web",
    time: "1 minute ago",
    number: "#59",
    title: "Fix nav overflow on mobile",
    tone: "changes",
  },
]

// --- Value strip -------------------------------------------------------------

export const VALUE_POINTS = [
  "Every repo your account can access",
  "Public & private",
  "Zero per-repo webhooks",
] as const

// --- Features ----------------------------------------------------------------

export type Feature = {
  icon: string // hugeicons export name
  title: string
  body: string
  accent?: boolean
}

export const FEATURES: Feature[] = [
  {
    icon: "Link01Icon",
    title: "One click to connect",
    body: "Run /link, authorize once on GitHub, done. No webhooks, no YAML, no per-repository setup.",
  },
  {
    icon: "SlidersHorizontalIcon",
    title: "Hear only what matters",
    body: "/listen-to picks exactly which subject types and reasons reach you. Mute the rest — the noise never arrives.",
  },
  {
    icon: "CheckmarkBadge01Icon",
    title: "PR verdicts, not pings",
    body: "Approved, changes requested, or commented — the DM tells you the outcome, not just that someone reviewed.",
    accent: true,
  },
  {
    icon: "Calendar03Icon",
    title: "A single daily digest",
    body: "One 6am summary of the PRs waiting on your review — and only when there's actually something to say.",
  },
  {
    icon: "TickDouble01Icon",
    title: "Never floods you",
    body: "First connect baselines your history and sends one welcome summary — not two hundred backlog pings.",
  },
  {
    icon: "SquareLock02Icon",
    title: "Read-only & encrypted",
    body: "Your token is AES-256-GCM encrypted at rest. OctoBot never writes to your repos or marks anything read.",
  },
]

// --- How it works (a real ordered sequence) ---------------------------------

export type Step = {
  n: string
  title: string
  body: string
  scene: "connect" | "baseline" | "notify" | "digest"
}

export const STEPS: Step[] = [
  {
    n: "01",
    title: "Connect",
    body: "Run /link and OctoBot hands you a personal GitHub authorization link, guarded by a single-use, time-limited token. Authorize, and your account is linked.",
    scene: "connect",
  },
  {
    n: "02",
    title: "Baseline",
    body: "On first connect it marks today's notifications as already-seen and DMs you one welcome summary of what needs attention — so you're never blasted with history.",
    scene: "baseline",
  },
  {
    n: "03",
    title: "Notify",
    body: "About once a minute OctoBot checks GitHub for new activity, filters it against your subscription, enriches PR reviews with their verdict, and DMs you — deduplicated per thread.",
    scene: "notify",
  },
  {
    n: "04",
    title: "Digest",
    body: "At 6am it can send a once-a-day roundup of the pull requests awaiting your review. Optional, and only sent when the list isn't empty.",
    scene: "digest",
  },
]

// --- Commands ----------------------------------------------------------------

export type Command = {
  name: string
  arg?: string
  body: string
}

export const COMMANDS: Command[] = [
  { name: "/link", body: "Get a personal GitHub authorization link — click it to connect your account." },
  { name: "/status", body: "See your connected login plus what needs your review right now, fetched live." },
  { name: "/listen-to", body: "Pick which notification types and reasons you receive. Saves the instant you change it." },
  { name: "/digest", body: "Turn the daily PR digest on or off, or preview it immediately." },
  { name: "/connect-token", body: "Connect with a Personal Access Token instead — for accounts behind org OAuth restrictions." },
  { name: "/unlink", body: "Disconnect your account and erase everything OctoBot stores about you." },
]

// --- Notification catalog ----------------------------------------------------

export const SUBJECT_TYPES = [
  { emoji: "🔀", label: "Pull requests" },
  { emoji: "🐛", label: "Issues" },
  { emoji: "💬", label: "Discussions" },
  { emoji: "🚀", label: "Releases" },
  { emoji: "📝", label: "Commits" },
  { emoji: "✅", label: "CI / checks" },
  { emoji: "🛡️", label: "Security alerts" },
] as const

export const REASONS = [
  "🔔 Review requested",
  "💬 New comment",
  "📣 Mentioned",
  "🔀 State changed",
  "✍️ Activity on your PR",
  "👥 Team mentioned",
  "📌 Assigned",
  "⚙️ CI activity",
  "🔖 Subscribed thread",
  "🛡️ Security alert",
  "⬆️ New commits pushed",
] as const

// --- Security ----------------------------------------------------------------

export type SecurityPoint = {
  icon: string
  title: string
  body: string
}

export const SECURITY: SecurityPoint[] = [
  {
    icon: "SquareLock02Icon",
    title: "Encrypted at rest",
    body: "Tokens are sealed with AES-256-GCM. The key lives only in the environment and is never logged.",
  },
  {
    icon: "Key01Icon",
    title: "CSRF-safe OAuth",
    body: "Every authorization link carries a single-use state that expires after ten minutes.",
  },
  {
    icon: "ViewIcon",
    title: "Strictly read-only",
    body: "OctoBot reads your notifications to tell you about them. It never marks them read or writes to a repo.",
  },
  {
    icon: "Shield01Icon",
    title: "Least logging",
    body: "Only IDs, statuses, and errors are recorded — never your tokens, secrets, or message contents.",
  },
  {
    icon: "Github01Icon",
    title: "Open source",
    body: "Every line is public and MIT-licensed. Don't take the read-only promise on faith — read the code that keeps it.",
  },
]

// --- FAQ ---------------------------------------------------------------------

export type Faq = {
  q: string
  a: string
}

export const FAQS: Faq[] = [
  {
    q: "Does OctoBot need access to my private repositories?",
    a: "To surface notifications from private repos, GitHub requires the classic repo scope — the only OAuth scope that exposes private-repository activity. OctoBot uses it read-only in practice, and your token is encrypted at rest. Only connect an account you trust the host with.",
  },
  {
    q: "Will it write to my repositories or mark my notifications as read?",
    a: "No. OctoBot is read-only. It never marks GitHub notifications as read, comments, or changes anything in your repositories — it only reads activity in order to DM you about it.",
  },
  {
    q: "My organization blocks OAuth apps. Can I still use it?",
    a: "Yes. Run /connect-token to connect with a classic Personal Access Token (repo scope) instead of the OAuth flow. The token is stored encrypted, exactly like an OAuth token.",
  },
  {
    q: "How quickly do notifications arrive?",
    a: "A background poller checks each connected account about once a minute using conditional requests, so you hear about new activity within roughly a minute of it happening on GitHub.",
  },
  {
    q: "How do I disconnect and delete my data?",
    a: "Run /unlink. It immediately stops all notifications and erases the account record OctoBot keeps about you — your token, watermark, and preferences.",
  },
  {
    q: "Will it flood me when I first connect?",
    a: "No. On first connect OctoBot baselines your current notifications as already-seen and sends a single welcome summary. You start from a clean slate, not a backlog.",
  },
]
