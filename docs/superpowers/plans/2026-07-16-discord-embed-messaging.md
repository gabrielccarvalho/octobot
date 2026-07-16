# Discord Embed Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every pushed Discord message as an embed carrying a mascot thumbnail, title, body and relative timestamp, while leaving command replies as plain text.

**Architecture:** `DmSender.sendDm` widens from `string` to an `OctoMessage` payload — a domain type that knows nothing about discord.js. Domain modules (`notifier.ts`, `status.ts`, `digest.ts`) produce `OctoMessage`; a single renderer at the edge (`discord/render.ts`) turns it into an `EmbedBuilder`. Tasks 1-6 are purely additive and keep the build green; Task 7 is the atomic switch that flips the interface and rewires all five call sites.

**Tech Stack:** TypeScript 5.6, discord.js 14.26.5, vitest 2.1, Node 20.

**Spec:** `docs/superpowers/specs/2026-07-16-discord-embed-messaging-design.md`

## Global Constraints

- **Command replies must keep working, untouched.** `/status` (`handlers.ts:143`), `/digest` "Preview now" (`client.ts:158`), `/link`, `/unlink`, `/listen-to`, `/connect-token` stay plain text. `formatAttention` and `formatDigest` keep returning `string`.
- **`handlers.test.ts:134` must pass unchanged, at every task.** It is the regression guard for the non-goal. Never edit it.
- **Tone keys are snake_case; filenames are kebab-case.** The `image` field is the only source of truth for a filename. Never derive a path from a tone key.
- **Colours are hex number literals** (`0x8957e5`), not strings — `setColor` takes a number.
- **Relative time lives at the end of the `body`.** Embed footers do not parse `<t:unix:R>`; only descriptions and field values do. Never use `setTimestamp()`.
- **Assets already exist and are committed** at `apps/landing-page/public/mascot/*-v1.png`. Do not create, move, or regenerate them.
- Run all tests with `cd apps/bot && npx vitest run <path>`.

---

## File Structure

**Create:**
- `apps/bot/src/messages/tone.ts` — `Tone` union + `TONE` registry (image + default colour). No discord.js.
- `apps/bot/src/messages/tone.test.ts`
- `apps/bot/src/discord/render.ts` — `renderEmbed(message, mascotBaseUrl)`. The only new file importing discord.js.
- `apps/bot/src/discord/render.test.ts`

**Modify:**
- `apps/bot/src/config.ts` — add `mascotBaseUrl` (optional-with-default; new machinery)
- `apps/bot/src/notifier.ts` — `OctoMessage`, widen `DmSender`, tone/colour maps, `notificationMessage`
- `apps/bot/src/status.ts` — add `attentionMessage` / `digestMessage` (keep the string formatters)
- `apps/bot/src/digest.ts` — extract `buildDigestData`; DM path uses `digestMessage`
- `apps/bot/src/onboarding.ts:58-61` — use `attentionMessage`
- `apps/bot/src/poller.ts:34-37,56-60,98` — three `sendDm` sites
- `apps/bot/src/discord/client.ts:67-73,267-272` — `mascotBaseUrl` param; sender renders embed
- `apps/bot/src/index.ts` — pass `config.mascotBaseUrl`

**Why `OctoMessage` lives in `notifier.ts`:** `DmSender` is already there and `digest.ts` already imports it from there. A separate file would add an import hop for a 6-line interface.

---

### Task 1: Config — `MASCOT_BASE_URL`

`config.ts` currently throws for every var in `REQUIRED` and has **no optional-with-default path**. This adds one.

**Files:**
- Modify: `apps/bot/src/config.ts:1-10` (interface), `:44-49` (return)
- Test: `apps/bot/src/config.test.ts`

**Interfaces:**
- Produces: `Config.mascotBaseUrl: string` — trailing slashes stripped; defaults to `https://octobot.dev/mascot`.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe("loadConfig", ...)` block in `apps/bot/src/config.test.ts`:

```ts
  it("defaults mascotBaseUrl when MASCOT_BASE_URL is unset", () => {
    expect(loadConfig(base).mascotBaseUrl).toBe("https://octobot.dev/mascot");
  });

  it("overrides mascotBaseUrl and strips trailing slashes", () => {
    const cfg = loadConfig({ ...base, MASCOT_BASE_URL: "https://cdn.example.com/art///" });
    expect(cfg.mascotBaseUrl).toBe("https://cdn.example.com/art");
  });

  it("falls back to the default when MASCOT_BASE_URL is blank", () => {
    expect(loadConfig({ ...base, MASCOT_BASE_URL: "   " }).mascotBaseUrl).toBe(
      "https://octobot.dev/mascot"
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/bot && npx vitest run src/config.test.ts`
Expected: FAIL — `undefined` is not `"https://octobot.dev/mascot"`.

- [ ] **Step 3: Implement**

In `apps/bot/src/config.ts`, add to the `Config` interface after `publicBaseUrl: string;`:

```ts
  mascotBaseUrl: string;
```

Add above `const REQUIRED`:

```ts
// Optional, unlike everything in REQUIRED: self-hosters inherit working images.
const DEFAULT_MASCOT_BASE_URL = "https://octobot.dev/mascot";
```

Add to the returned object in `loadConfig`, after `publicBaseUrl`:

```ts
    mascotBaseUrl: (env.MASCOT_BASE_URL?.trim() || DEFAULT_MASCOT_BASE_URL).replace(/\/+$/, ""),
```

Do **not** add `MASCOT_BASE_URL` to `REQUIRED` — that would make it throw.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/bot && npx vitest run src/config.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/bot/src/config.ts apps/bot/src/config.test.ts
git commit -m "feat(bot): add optional MASCOT_BASE_URL config with default"
```

---

### Task 2: Tone registry

**Files:**
- Create: `apps/bot/src/messages/tone.ts`
- Test: `apps/bot/src/messages/tone.test.ts`

**Interfaces:**
- Produces: `type Tone` (9-member union); `const TONE: Record<Tone, { image: string; color: number }>`. Consumed by Tasks 3, 4, 5, 6.

- [ ] **Step 1: Write the failing test**

Create `apps/bot/src/messages/tone.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { TONE, type Tone } from "./tone";

const ALL: Tone[] = [
  "celebrate", "needs_work", "summoned", "chatter",
  "alarm", "all_good", "working", "broken", "digest",
];

describe("TONE", () => {
  it("has an entry for every tone", () => {
    for (const t of ALL) expect(TONE[t]).toBeDefined();
    expect(Object.keys(TONE).sort()).toEqual([...ALL].sort());
  });

  it("uses kebab-case v1 filenames, never the snake_case tone key", () => {
    for (const t of ALL) {
      expect(TONE[t].image).toMatch(/^[a-z]+(-[a-z]+)*-v1\.png$/);
      expect(TONE[t].image).not.toContain("_");
    }
    expect(TONE.needs_work.image).toBe("needs-work-v1.png");
    expect(TONE.all_good.image).toBe("all-good-v1.png");
  });

  it("gives every tone a colour in valid 24-bit range", () => {
    for (const t of ALL) {
      expect(TONE[t].color).toBeGreaterThanOrEqual(0);
      expect(TONE[t].color).toBeLessThanOrEqual(0xffffff);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/bot && npx vitest run src/messages/tone.test.ts`
Expected: FAIL — cannot resolve `./tone`.

- [ ] **Step 3: Implement**

Create `apps/bot/src/messages/tone.ts`:

```ts
// The emotional register of a message. Drives the mascot thumbnail and a default
// colour; individual events may override the colour.
export type Tone =
  | "celebrate"
  | "needs_work"
  | "summoned"
  | "chatter"
  | "alarm"
  | "all_good"
  | "working"
  | "broken"
  | "digest";

// Tone keys are snake_case, filenames are kebab-case: `image` is the only source of
// truth for the filename. Never derive a path from the tone key.
export const TONE: Record<Tone, { image: string; color: number }> = {
  celebrate: { image: "celebrate-v1.png", color: 0x8957e5 },
  needs_work: { image: "needs-work-v1.png", color: 0xd29922 },
  summoned: { image: "summoned-v1.png", color: 0x58a6ff },
  chatter: { image: "chatter-v1.png", color: 0x58a6ff },
  alarm: { image: "alarm-v1.png", color: 0xf85149 },
  all_good: { image: "all-good-v1.png", color: 0x3fb950 },
  working: { image: "working-v1.png", color: 0x8b949e },
  broken: { image: "broken-v1.png", color: 0xf85149 },
  digest: { image: "digest-v1.png", color: 0x8957e5 },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/bot && npx vitest run src/messages/tone.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify every image exists on disk**

Run:
```bash
cd /Users/gabe/www/personal/octobot && \
for f in celebrate needs-work summoned chatter alarm all-good working broken digest; do
  test -f "apps/landing-page/public/mascot/$f-v1.png" && echo "ok $f" || echo "MISSING $f"
done
```
Expected: nine `ok` lines, no `MISSING`.

- [ ] **Step 6: Commit**

```bash
git add apps/bot/src/messages/tone.ts apps/bot/src/messages/tone.test.ts
git commit -m "feat(bot): add tone registry mapping tones to mascot art and colours"
```

---

### Task 3: `OctoMessage` + `notificationMessage`

Additive only — `formatNotification` and `DmSender` are untouched, so the build stays green. Task 7 removes the old function.

**Files:**
- Modify: `apps/bot/src/notifier.ts:15-59`
- Test: `apps/bot/src/notifier.test.ts`

**Interfaces:**
- Consumes: `Tone`, `TONE` from Task 2.
- Produces:
  - `interface OctoMessage { tone: Tone; title: string; body: string; color?: number }`
  - `function notificationMessage(item: NotificationItem, outcome?: PrOutcome | null): OctoMessage`
  - `function toneForReason(key: string): Tone`
  - `const REASON_TONE: Record<string, Tone>` — exported for the coverage test only

- [ ] **Step 1: Write the failing test**

Append to `apps/bot/src/notifier.test.ts` (the `item` / `authorItem` fixtures at the top of that file already exist — reuse them; add `notificationMessage` and `toneForReason` to the existing import from `./notifier`):

```ts
describe("notificationMessage", () => {
  it("puts emoji+label in the title and link+repo+relative-time in the body", () => {
    const msg = notificationMessage(item, { source: "event", kind: "merged" });
    const unix = Math.floor(Date.parse("2026-06-17T10:00:00Z") / 1000);
    expect(msg.title).toBe("🎉 Your PR was merged");
    expect(msg.body).toBe(
      `[#42 Fix the widget](https://github.com/acme/repo/pull/42)\nacme/repo · <t:${unix}:R>`
    );
    expect(msg.tone).toBe("celebrate");
    expect(msg.color).toBe(0x8957e5);
  });

  it("renders a numberless subject without a leading #", () => {
    const release = {
      ...item,
      reason: "subscribed",
      subjectType: "Release",
      subjectNumber: null,
      subjectTitle: "v1.2.0",
      subjectUrl: "https://github.com/acme/repo",
    };
    expect(notificationMessage(release).body.split("\n")[0]).toBe(
      "[v1.2.0](https://github.com/acme/repo)"
    );
  });

  it("separates merged from approved by colour despite sharing a tone", () => {
    const merged = notificationMessage(item, { source: "event", kind: "merged" });
    const approved = notificationMessage(item, { source: "event", kind: "approved" });
    expect(merged.tone).toBe(approved.tone);
    expect(merged.color).not.toBe(approved.color);
  });

  it("separates reviewed from commented by colour despite sharing tone and emoji", () => {
    const reviewed = notificationMessage(item, { source: "event", kind: "reviewed" });
    const commented = notificationMessage(item, { source: "event", kind: "commented" });
    expect(reviewed.tone).toBe("chatter");
    expect(commented.tone).toBe("chatter");
    expect(reviewed.color).toBe(0xa371f7);
    expect(commented.color).toBe(0x58a6ff);
  });

  it("maps closed to working, not alarm", () => {
    expect(notificationMessage(item, { source: "event", kind: "closed" }).tone).toBe("working");
  });

  it("maps CI verdicts", () => {
    expect(notificationMessage(item, { source: "checks", verdict: "passed" }).tone).toBe("all_good");
    expect(notificationMessage(item, { source: "checks", verdict: "failed" }).tone).toBe("alarm");
    expect(notificationMessage(item, { source: "checks", verdict: "failed" }).color).toBe(0xf85149);
  });

  it("uses the working tone with no colour override for the generic PR fallback", () => {
    const msg = notificationMessage(authorItem);
    expect(msg.title).toBe("🔔 Update on your PR");
    expect(msg.tone).toBe("working");
    expect(msg.color).toBeUndefined();
  });

  it("falls back to a reason tone for non-PR subjects", () => {
    const issue = { ...item, subjectType: "Issue", reason: "comment" };
    expect(notificationMessage(issue).tone).toBe("chatter");
  });
});

describe("toneForReason", () => {
  // Asserts EXPLICIT coverage, not just "returns something". toneForReason ends in
  // `?? "working"`, so a test that merely checks the result is a valid Tone can never
  // fail — it would pass for garbage input and silently miss a new reason arriving
  // from taxonomy.ts without a tone. Check membership in the map instead.
  it("gives every known reason an explicit tone rather than the fallback", () => {
    expect(ALL_REASON_KEYS.filter((key) => !(key in REASON_TONE))).toEqual([]);
  });

  it("falls back to working for unknown reasons GitHub may add later", () => {
    expect(toneForReason("some_future_reason")).toBe("working");
  });
});
```

Add this import at the top of `notifier.test.ts`:

```ts
import { ALL_REASON_KEYS } from "./github/taxonomy";
```

and add `REASON_TONE, toneForReason, notificationMessage` to the existing `./notifier` import.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/bot && npx vitest run src/notifier.test.ts`
Expected: FAIL — `notificationMessage` is not exported.

- [ ] **Step 3: Implement**

In `apps/bot/src/notifier.ts`, add one import (`reasonMeta` is already imported from `./github/taxonomy` — leave that line alone; `ALL_REASON_KEYS` is needed only by the test, not by this module):

```ts
import type { Tone } from "./messages/tone";
```

Add after the `PrOutcome` type:

```ts
// What a message says and how it should feel. Deliberately knows nothing about
// discord.js — discord/render.ts turns this into an embed at the edge.
export interface OctoMessage {
  tone: Tone;
  title: string;
  body: string;
  color?: number; // overrides the tone's default
}

interface Meta {
  emoji: string;
  label: string;
  tone: Tone;
  color?: number;
}
```

Replace `PR_EVENT_LABEL` (currently `notifier.ts:15-30`) with:

```ts
const PR_EVENT_META: Record<PrEventKind, Meta> = {
  approved: { emoji: "✅", label: "Your PR was approved", tone: "celebrate", color: 0x3fb950 },
  changes_requested: {
    emoji: "🔧",
    label: "Changes requested on your PR",
    tone: "needs_work",
    color: 0xd29922, // amber, not red: healthy review is not a failure
  },
  reviewed: { emoji: "💬", label: "New review on your PR", tone: "chatter", color: 0xa371f7 },
  commented: { emoji: "💬", label: "New comment on your PR", tone: "chatter", color: 0x58a6ff },
  committed: { emoji: "📌", label: "New commits on your PR", tone: "working", color: 0x8b949e },
  merged: { emoji: "🎉", label: "Your PR was merged", tone: "celebrate", color: 0x8957e5 },
  closed: { emoji: "🚪", label: "Your PR was closed", tone: "working", color: 0x848d97 },
  reopened: { emoji: "🔓", label: "Your PR was reopened", tone: "working", color: 0x3fb950 },
  ready_for_review: {
    emoji: "📝",
    label: "Marked ready for review",
    tone: "summoned",
    color: 0x58a6ff,
  },
  converted_to_draft: {
    emoji: "📄",
    label: "Converted to draft",
    tone: "working",
    color: 0x848d97,
  },
  assigned: { emoji: "👤", label: "You were assigned", tone: "summoned", color: 0x58a6ff },
  labeled: { emoji: "🏷️", label: "Labels changed on your PR", tone: "working", color: 0x8b949e },
  review_requested: { emoji: "🔔", label: "Review requested", tone: "summoned", color: 0x58a6ff },
  mentioned: { emoji: "📣", label: "Mentioned", tone: "summoned", color: 0xd29922 },
};
```

Replace `CHECKS_LABEL` (currently `notifier.ts:32-35`) with:

```ts
const CHECKS_META: Record<ChecksVerdict, Meta> = {
  passed: { emoji: "✅", label: "CI passed on your PR", tone: "all_good", color: 0x3fb950 },
  failed: { emoji: "❌", label: "CI failed on your PR", tone: "alarm", color: 0xf85149 },
};
```

Add after `PR_FALLBACK`:

```ts
// Reason tones carry no colour override — the tone default is correct for all of them.
// Exported so the test can assert every key in taxonomy.ts has an explicit entry here;
// without that, toneForReason's fallback would silently swallow a new GitHub reason.
export const REASON_TONE: Record<string, Tone> = {
  comment: "chatter",
  review_requested: "summoned",
  mention: "summoned",
  team_mention: "summoned",
  assign: "summoned",
  invitation: "summoned",
  security_alert: "alarm",
  state_change: "working",
  author: "working",
  ci_activity: "working",
  subscribed: "working",
  manual: "working",
  your_activity: "working",
  push: "working",
};

// GitHub adds reason values over time; mirror reasonMeta's fallback rather than
// assuming the known keys are total.
export function toneForReason(key: string): Tone {
  return REASON_TONE[key] ?? "working";
}
```

Replace `resolveMeta` (currently `notifier.ts:42-47`) with — note the resolution order is unchanged:

```ts
function resolveMeta(item: NotificationItem, outcome: PrOutcome | null): Meta {
  if (outcome?.source === "event") return PR_EVENT_META[outcome.kind];
  if (outcome?.source === "checks") return CHECKS_META[outcome.verdict];
  if (item.subjectType === "PullRequest" && GENERIC_PR_REASONS.has(item.reason)) {
    return { ...PR_FALLBACK, tone: "working" };
  }
  const meta = reasonMeta(item.reason);
  return { emoji: meta.emoji, label: meta.label, tone: toneForReason(item.reason) };
}
```

Add `notificationMessage` below `formatNotification`, leaving `formatNotification` in place for now:

```ts
export function notificationMessage(
  item: NotificationItem,
  outcome?: PrOutcome | null
): OctoMessage {
  const meta = resolveMeta(item, outcome ?? null);
  // Discord renders <t:UNIX:R> as a localized, auto-updating "5 minutes ago". It only
  // parses in a description, never a footer — so it lives at the end of the body.
  const unix = Math.floor(new Date(item.updatedAt).getTime() / 1000);
  const link =
    item.subjectNumber != null
      ? `[#${item.subjectNumber} ${item.subjectTitle}](${item.subjectUrl})`
      : `[${item.subjectTitle}](${item.subjectUrl})`;
  return {
    tone: meta.tone,
    color: meta.color,
    title: `${meta.emoji} ${meta.label}`,
    body: [link, `${item.repoFullName} · <t:${unix}:R>`].join("\n"),
  };
}
```

`formatNotification` still calls `resolveMeta`, which now returns extra fields it ignores — it keeps compiling and its existing tests keep passing.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/bot && npx vitest run src/notifier.test.ts && npx tsc --noEmit`
Expected: PASS — both the new `notificationMessage` tests and the pre-existing `formatNotification` tests.

- [ ] **Step 5: Verify nothing else broke**

Run: `cd apps/bot && npx vitest run`
Expected: PASS, all suites.

- [ ] **Step 6: Commit**

```bash
git add apps/bot/src/notifier.ts apps/bot/src/notifier.test.ts
git commit -m "feat(bot): add OctoMessage and notificationMessage alongside string formatter"
```

---

### Task 4: `attentionMessage` + `digestMessage`

Additive. `formatAttention` / `formatDigest` keep returning `string` so `/status` and `/digest` preview are untouched.

**Files:**
- Modify: `apps/bot/src/status.ts:90-105`
- Test: `apps/bot/src/status.test.ts`

**Interfaces:**
- Consumes: `OctoMessage` (Task 3), `Tone` (Task 2).
- Produces: `attentionMessage(githubLogin: string, list: AttentionList): OctoMessage`; `digestMessage(githubLogin: string, list: AttentionList): OctoMessage`.

- [ ] **Step 1: Write the failing test**

Append to `apps/bot/src/status.test.ts`. Add `attentionMessage, digestMessage` to the existing import from `./status`:

```ts
describe("attentionMessage / digestMessage", () => {
  const list = {
    incoming: [] as never[],
    mine: [] as never[],
    ssoPartialOrgIds: [] as string[],
  };

  it("puts the header in the title with no markdown, and the body without it", () => {
    const msg = attentionMessage("octocat", list);
    expect(msg.title).toBe("✅ Connected as octocat");
    expect(msg.title).not.toContain("`");
    expect(msg.tone).toBe("celebrate");
    expect(msg.body).toContain("Nothing awaiting your review.");
    expect(msg.body).not.toContain("Connected as");
  });

  it("gives the digest its own tone and title", () => {
    const msg = digestMessage("octocat", list);
    expect(msg.title).toBe("☀️ Daily PR digest for octocat");
    expect(msg.title).not.toContain("*");
    expect(msg.tone).toBe("digest");
  });

  it("shares its body with the string formatter minus the header", () => {
    const msg = digestMessage("octocat", list);
    expect(formatDigest("octocat", list)).toContain(msg.body);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/bot && npx vitest run src/status.test.ts`
Expected: FAIL — `attentionMessage` is not exported.

- [ ] **Step 3: Implement**

In `apps/bot/src/status.ts`, add to imports:

```ts
import type { OctoMessage } from "./notifier";
```

Add after `formatAttention`:

```ts
// The embed twin of formatAttention. The header becomes the embed title (which renders
// no markdown, hence no backticks) and renderBody becomes the description.
export function attentionMessage(githubLogin: string, list: AttentionList): OctoMessage {
  return {
    tone: "celebrate",
    title: `✅ Connected as ${githubLogin}`,
    body: clampMessage(renderBody(list)),
  };
}
```

Add after `formatDigest`:

```ts
export function digestMessage(githubLogin: string, list: AttentionList): OctoMessage {
  return {
    tone: "digest",
    title: `☀️ Daily PR digest for ${githubLogin}`,
    body: clampMessage(renderBody(list)),
  };
}
```

`formatAttention` and `formatDigest` are unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/bot && npx vitest run src/status.test.ts src/discord/handlers.test.ts && npx tsc --noEmit`
Expected: PASS. `handlers.test.ts` passing confirms `/status` is untouched.

- [ ] **Step 5: Commit**

```bash
git add apps/bot/src/status.ts apps/bot/src/status.test.ts
git commit -m "feat(bot): add embed twins of the attention and digest formatters"
```

---

### Task 5: Extract `buildDigestData`

`buildDigest` currently fetches, checks emptiness, *and* renders a string. `client.ts:158` needs the string; the DM path needs an `OctoMessage`. Split fetching from rendering so both compose from one fetch.

**Files:**
- Modify: `apps/bot/src/digest.ts:19-31`
- Test: `apps/bot/src/digest.test.ts`

**Interfaces:**
- Consumes: nothing new — `formatDigest` and `AttentionList` already exist in `status.ts`.
- Produces: `buildDigestData(deps: DigestDeps, user: User): Promise<AttentionList | null>`. `buildDigest` keeps its exact existing signature `(deps, user) => Promise<string | null>`. Task 7 consumes both.

- [ ] **Step 1: Write the failing test**

Append to `apps/bot/src/digest.test.ts`. Change the existing import to add `buildDigestData`:

```ts
import { buildDigest, buildDigestData, sendDigests, type DigestDeps } from "./digest";
```

This file's existing `deps(results, ssoPartialOrgIds)` helper is keyed by **query string** (`"AWAITING"` / `"MINE"`), and `user` comes from `db.getUser("d1")!` inside each test — reuse both exactly as the existing tests do:

```ts
describe("buildDigestData", () => {
  it("returns null when there is nothing to report", async () => {
    const user = db.getUser("d1")!;
    expect(await buildDigestData(deps({ AWAITING: [], MINE: [] }), user)).toBeNull();
  });

  it("returns the list when a warning-only digest is warranted", async () => {
    const user = db.getUser("d1")!;
    const d = deps({ AWAITING: [], MINE: [] }, { AWAITING: ["21955855"], MINE: ["21955855"] });
    const list = await buildDigestData(d, user);
    expect(list).not.toBeNull();
    expect(list!.ssoPartialOrgIds).toEqual(["21955855"]);
  });

  it("still backs buildDigest's string output unchanged", async () => {
    const user = db.getUser("d1")!;
    const msg = await buildDigest(deps({ AWAITING: [pr(7)], MINE: [] }), user);
    expect(msg).toContain("Daily PR digest");
    expect(msg).toContain("#7");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/bot && npx vitest run src/digest.test.ts`
Expected: FAIL — `buildDigestData` is not exported.

- [ ] **Step 3: Implement**

In `apps/bot/src/digest.ts`, update imports. `digestMessage` is **not** imported here — `sendDigests` still sends a string until Task 7:

```ts
import { formatDigest, type AttentionList } from "./status";
```

Replace `buildDigest` (currently `digest.ts:19-31`) with:

```ts
// Stateless current-state snapshot of the PRs needing this user's attention.
// Returns null when there is truly nothing to report. If PRs were filtered out
// by an SSO-restricted org, we still DM a warning-only digest so a user whose
// PRs live entirely inside that org isn't left silently digest-less.
export async function buildDigestData(
  deps: DigestDeps,
  user: User
): Promise<AttentionList | null> {
  const token = deps.decryptToken(user);
  const [incomingResult, mineResult] = await Promise.all([
    deps.searchPullRequests(token, deps.awaitingQuery),
    deps.fetchMinePrs(token),
  ]);
  const incoming = incomingResult.prs;
  const mine = mineResult.prs;
  const ssoPartialOrgIds = [
    ...new Set([...incomingResult.ssoPartialOrgIds, ...mineResult.ssoPartialOrgIds]),
  ];
  if (incoming.length === 0 && mine.length === 0 && ssoPartialOrgIds.length === 0) return null;
  return { incoming, mine, ssoPartialOrgIds };
}

// Plain-text digest for the /digest "Preview now" button (client.ts:158), which is an
// ephemeral command reply and deliberately stays a string.
export async function buildDigest(deps: DigestDeps, user: User): Promise<string | null> {
  const list = await buildDigestData(deps, user);
  return list ? formatDigest(user.githubLogin, list) : null;
}
```

Leave `sendDigests` alone for now — Task 7 switches it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/bot && npx vitest run src/digest.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/bot/src/digest.ts apps/bot/src/digest.test.ts
git commit -m "refactor(bot): split digest fetching from rendering"
```

---

### Task 6: The embed renderer

**Files:**
- Create: `apps/bot/src/discord/render.ts`
- Test: `apps/bot/src/discord/render.test.ts`

**Interfaces:**
- Consumes: `OctoMessage` (Task 3), `TONE` (Task 2).
- Produces: `renderEmbed(message: OctoMessage, mascotBaseUrl: string): EmbedBuilder`. Consumed by Task 7.

- [ ] **Step 1: Write the failing test**

Create `apps/bot/src/discord/render.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderEmbed } from "./render";
import { TONE } from "../messages/tone";
import type { OctoMessage } from "../notifier";

const base: OctoMessage = { tone: "celebrate", title: "Your PR was merged", body: "hello" };

describe("renderEmbed", () => {
  it("maps title, body and thumbnail from the tone", () => {
    const e = renderEmbed(base, "https://octobot.dev/mascot").toJSON();
    expect(e.title).toBe("Your PR was merged");
    expect(e.description).toBe("hello");
    expect(e.thumbnail?.url).toBe("https://octobot.dev/mascot/celebrate-v1.png");
    expect(e.footer?.text).toBe("OctoBot");
  });

  it("falls back to the tone's default colour", () => {
    expect(renderEmbed(base, "https://x.dev").toJSON().color).toBe(TONE.celebrate.color);
  });

  it("prefers an explicit colour override", () => {
    const e = renderEmbed({ ...base, color: 0x3fb950 }, "https://x.dev").toJSON();
    expect(e.color).toBe(0x3fb950);
  });

  it("never sets a timestamp — footers cannot render relative time", () => {
    expect(renderEmbed(base, "https://x.dev").toJSON().timestamp).toBeUndefined();
  });

  it("builds a valid URL for every tone", () => {
    for (const tone of Object.keys(TONE) as (keyof typeof TONE)[]) {
      const url = renderEmbed({ ...base, tone }, "https://octobot.dev/mascot").toJSON().thumbnail
        ?.url;
      expect(url).toBe(`https://octobot.dev/mascot/${TONE[tone].image}`);
      expect(url).not.toContain("//mascot//");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/bot && npx vitest run src/discord/render.test.ts`
Expected: FAIL — cannot resolve `./render`.

- [ ] **Step 3: Implement**

Create `apps/bot/src/discord/render.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/bot && npx vitest run src/discord/render.test.ts && npx tsc --noEmit`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/bot/src/discord/render.ts apps/bot/src/discord/render.test.ts
git commit -m "feat(bot): add OctoMessage to Discord embed renderer"
```

---

### Task 7: Widen `DmSender` and rewire every call site

The atomic switch. TypeScript cannot compile a half-widened interface, so all five `sendDm` call sites, the sender implementation, and the `startDiscord` signature change together. Every piece it depends on is already built and tested by Tasks 1-6.

**Files:**
- Modify: `apps/bot/src/notifier.ts:6-8` (interface), and delete `formatNotification`
- Modify: `apps/bot/src/poller.ts:34-37`, `:56-60`, `:98`
- Modify: `apps/bot/src/onboarding.ts:58-61`
- Modify: `apps/bot/src/digest.ts` (`sendDigests` only)
- Modify: `apps/bot/src/discord/client.ts:67-73`, `:267-272`
- Modify: `apps/bot/src/index.ts` (`startDiscord` call)
- Test: `apps/bot/src/poller.test.ts`, `apps/bot/src/onboarding.test.ts`, `apps/bot/src/notifier.test.ts`, `apps/bot/src/digest.test.ts`

**Interfaces:**
- Consumes: `config.mascotBaseUrl` (Task 1); `notificationMessage`, `OctoMessage` (Task 3); `attentionMessage`, `digestMessage` (Task 4); `buildDigestData` (Task 5); `renderEmbed` (Task 6).
- Produces: `DmSender.sendDm(discordId: string, message: OctoMessage): Promise<void>`; `startDiscord(token, db, linkDeps, statusDeps, digestDeps, tokenDeps, mascotBaseUrl)`.

Task 5's `import { formatDigest, type AttentionList }` gains `digestMessage` here — this is the step that adds it.

- [ ] **Step 1: Widen the interface and delete the old formatter**

In `apps/bot/src/notifier.ts`, change the `DmSender` interface (`notifier.ts:6-8`) to:

```ts
export interface DmSender {
  sendDm(discordId: string, message: OctoMessage): Promise<void>;
}
```

Delete the entire `formatNotification` function (currently `notifier.ts:49-59`). `notificationMessage` replaces it.

- [ ] **Step 2: Run typecheck to see every break**

Run: `cd apps/bot && npx tsc --noEmit`
Expected: FAIL, listing exactly the call sites Steps 3-6 fix — `poller.ts` (×3), `onboarding.ts`, `digest.ts`, `client.ts`. Use this list to confirm nothing is missed.

- [ ] **Step 3: Fix `poller.ts`**

Add to imports in `apps/bot/src/poller.ts`:

```ts
import { notificationMessage } from "./notifier";
```

(If `poller.ts` already imports `formatNotification` from `./notifier`, replace that name.)

Replace the revocation DM (`poller.ts:34-37`) with:

```ts
      await deps.sender.sendDm(user.discordId, {
        tone: "broken",
        color: 0xf85149,
        title: "⚠️ GitHub connection lost",
        body: `Your GitHub connection expired or was revoked. ${reconnectHint(user.authSource)}`,
      });
```

Replace the SSO warning DM (`poller.ts:56-60`) with:

```ts
        await deps.sender.sendDm(user.discordId, {
          tone: "broken",
          color: 0xd29922,
          title: "⚠️ SAML SSO authorization needed",
          body:
            `Your token isn't authorized for ${n} SAML SSO organization${n > 1 ? "s" : ""}, ` +
            `so notifications from there won't arrive. Authorize it at ` +
            `<${TOKEN_SETTINGS_URL}> → **Configure SSO**.`,
        });
```

Replace the notification send (`poller.ts:98`) with:

```ts
      await deps.sender.sendDm(user.discordId, notificationMessage(item, outcome));
```

- [ ] **Step 4: Fix `onboarding.ts`**

In `apps/bot/src/onboarding.ts`, change the `formatAttention` import (`onboarding.ts:5`) to:

```ts
import { attentionMessage } from "./status";
```

Replace the send (`onboarding.ts:58-61`) with:

```ts
    await deps.sender.sendDm(
      discordId,
      attentionMessage(githubLogin, { incoming, mine, ssoPartialOrgIds })
    );
```

- [ ] **Step 5: Fix `digest.ts`**

Replace `sendDigests` in `apps/bot/src/digest.ts` with:

```ts
export async function sendDigests(deps: DigestDeps): Promise<void> {
  for (const user of deps.db.getAllUsers()) {
    if (!deps.db.getDigestEnabled(user.discordId)) continue;
    try {
      const list = await buildDigestData(deps, user);
      if (list) await deps.sender.sendDm(user.discordId, digestMessage(user.githubLogin, list));
    } catch (err) {
      console.error(`Digest failed for ${user.discordId}:`, err);
    }
  }
}
```

- [ ] **Step 6: Fix `client.ts` and `index.ts`**

In `apps/bot/src/discord/client.ts`, add to imports:

```ts
import { renderEmbed } from "./render";
```

Add a seventh parameter to `startDiscord` (`client.ts:67-73`):

```ts
export async function startDiscord(
  token: string,
  db: Database,
  linkDeps: LinkDeps,
  statusDeps: StatusDeps,
  digestDeps: DigestDeps,
  tokenDeps: TokenDeps,
  mascotBaseUrl: string
): Promise<DiscordRuntime> {
```

Replace the sender (`client.ts:267-272`) with:

```ts
  const sender: DmSender = {
    async sendDm(discordId, message) {
      const user = await client.users.fetch(discordId);
      await user.send({ embeds: [renderEmbed(message, mascotBaseUrl)] });
    },
  };
```

In `apps/bot/src/index.ts`, add the argument to the `startDiscord` call:

```ts
  const { client, sender } = await startDiscord(
    config.discordToken,
    db,
    linkDeps,
    statusDeps,
    digestDeps,
    tokenDeps,
    config.mascotBaseUrl
  );
```

Leave the `DIGEST_PREVIEW_ID` handler at `client.ts:158` **exactly as it is** — it calls `buildDigest` (string) and `editReply`, and that is the non-goal.

- [ ] **Step 7: Run typecheck**

Run: `cd apps/bot && npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 8: Update the broken tests**

Four suites assert on the old string shape and must be rewritten to assert on `OctoMessage` fields.

**First, the `sent` accumulator type.** `poller.test.ts:11`, `onboarding.test.ts:9` and `digest.test.ts:8` all declare it identically:

```ts
let sent: { discordId: string; message: string }[];
```

In each of those three files, change `message` to `OctoMessage` and add the import:

```ts
import type { DmSender, OctoMessage } from "./notifier";

let sent: { discordId: string; message: OctoMessage }[];
```

(`poller.test.ts` and `digest.test.ts` already import `DmSender` from `./notifier` — extend that line rather than adding a second import.)

In `apps/bot/src/notifier.test.ts`: delete the entire `describe("formatNotification", ...)` block and remove `formatNotification` from the import. The `describe("notificationMessage", ...)` block from Task 3 replaces its coverage.

In `apps/bot/src/poller.test.ts`: every assertion reading `sent[0].message` as a string becomes a field read. The concrete replacements — note `:117` / `:125` / `:136-138` / `:147` assert on labels, which now live in `title`:

```ts
// :85  — revocation DM. The label moved to title; the prose stays in body.
expect(sent[0].message.tone).toBe("broken");
expect(sent[0].message.body).toMatch(/reconnect|expired|revoked/i);

// :117
expect(sent[0].message.title).toContain("Your PR was approved");

// :125
expect(sent[0].message.title).toContain("CI failed on your PR");

// :136-138
expect(sent[0].message.title).not.toContain("CI passed");
expect(sent[0].message.title).not.toContain("CI failed");
expect(sent[0].message.title).toContain("Review requested"); // prItem.reason fallback

// :147
expect(sent[0].message.title).toContain("Review requested"); // reason fallback, DM not dropped
```

In `apps/bot/src/onboarding.test.ts`:

```ts
// :76 — note the backticks are GONE: embed titles render no markdown.
expect(sent[0].message.title).toBe("✅ Connected as octocat");
expect(sent[0].message.tone).toBe("celebrate");

// :97 — the SSO warning comes from renderBody, so it lands in body.
expect(sent[0].message.body).toContain(
  "your token isn't authorized for 3 SAML SSO organizations."
);

// :104
expect(sent[0].message.body).not.toContain("⚠️");
```

In `apps/bot/src/digest.test.ts`: only the `sendDigests` assertions change — they read `sent[0].message.body` / `.title` / `.tone` now. Every `buildDigest` test keeps asserting on a string, unchanged, because `buildDigest` still returns one.

```ts
expect(sent[0].message.tone).toBe("digest");
expect(sent[0].message.title).toBe("☀️ Daily PR digest for octocat");
expect(sent[0].message.body).toContain("#7");
```

**Do not touch `apps/bot/src/discord/handlers.test.ts`.** It must pass unchanged.

- [ ] **Step 9: Run the full suite**

Run: `cd apps/bot && npx vitest run && npx tsc --noEmit`
Expected: PASS, every suite — including `handlers.test.ts` unmodified.

- [ ] **Step 10: Verify no string sends survive**

Run:
```bash
cd /Users/gabe/www/personal/octobot/apps/bot/src && \
  grep -rn "formatNotification" . || echo "clean: formatNotification is gone"
```
Expected: `clean: formatNotification is gone`.

- [ ] **Step 11: Commit**

```bash
git add apps/bot/src
git commit -m "feat(bot): send notifications as embeds with mascot thumbnails

Widen DmSender.sendDm from string to an OctoMessage payload and render
embeds at the discord/client.ts edge. Command replies (/status, /digest
preview) keep their plain-text path untouched."
```

---

## Verification

After Task 7, confirm the whole thing end-to-end.

- [ ] **Full suite + typecheck**

```bash
cd apps/bot && npx vitest run && npx tsc --noEmit
```

- [ ] **The non-goal held**

```bash
cd apps/bot && npx vitest run src/discord/handlers.test.ts
git diff HEAD~7 --stat -- src/discord/handlers.test.ts
```
Expected: tests pass; diff is empty (the file was never modified).

- [ ] **Assets are reachable once pushed**

The bot references `https://octobot.dev/mascot/<name>-v1.png`. Those files are committed but **`main` must be pushed** for Vercel to serve them, or every thumbnail 404s. After pushing:

```bash
for f in celebrate needs-work summoned chatter alarm all-good working broken digest; do
  printf "%-12s %s\n" "$f" "$(curl -s -o /dev/null -w '%{http_code}' https://octobot.dev/mascot/$f-v1.png)"
done
```
Expected: nine `200`s.

- [ ] **Live smoke test**

Run the bot against a real Discord account and trigger one notification. Confirm: thumbnail renders top-right, colour bar matches the event, the timestamp reads "a few seconds ago" (not "Today at…"), and the PR link does not spawn a second link-preview embed below the message.

---

## Notes for the implementer

- **`digest.png` already exists** in `apps/landing-page/public/mascot/` and is landing-page hero art. It is *not* `digest-v1.png`. Don't confuse or overwrite them.
- **Colours are numbers.** `setColor("#8957e5")` also works in discord.js but the registry uses numbers; stay consistent.
- **`clampMessage` is shared** with the command paths (`status.ts:28-30`). Task 4 reuses it deliberately. Do not relax `MAX_MESSAGE` — the embed description limit is 4096 but raising it is a separate follow-up, and the clamp still guards `/status`.
- **The masked-link comment at `notifier.ts:53`** explains suppressing Discord's link preview. Inside an embed, links never auto-expand, so that rationale is moot. Delete the comment in Task 3 when you rewrite the function; keep the masked link itself for readability.
