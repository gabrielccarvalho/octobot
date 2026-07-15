# Plan: Surface SAML SSO partial results

## Problem

A classic PAT created by `/connect-token` must be separately authorized for each
SAML SSO organization. Until it is, GitHub's `/search/issues` returns `200 OK`
with that org's PRs **silently removed**, and sets a response header:

```
X-GitHub-SSO: partial-results; organizations=21955855,20582480
```

`searchPullRequests` (`src/github/search.ts`) reads only `res.ok` and
`body.items`, discarding the header. `/status` and the daily digest therefore
render an incomplete list with an authoritative-looking count. `validateToken`
cannot detect this: it hits `/user`, which is single-org data and never trips
the SSO filter.

## Global Constraints

- **Never block a connection on SSO partial results.** The token is valid; it is
  merely incomplete. Warn, never reject.
- **Never resolve org IDs to names.** GitHub gives us numeric IDs only. Report
  the *count* of unauthorized orgs. Do not add an API call to resolve names.
- **No new GitHub API calls on the `/status` or digest hot path.** The SSO
  signal must ride along on the search responses we already make. The digest
  runs per-user in a sequential loop; this bot's polling already has a scaling
  ceiling near 120 users.
- Only `partial-results` counts. The header can also read
  `X-GitHub-SSO: required; url=...` — that is a different (403) case and must
  not be parsed as partial results.
- Header lookup must be case-insensitive-safe: use `headers.get("x-github-sso")`.
- Existing behavior when the header is absent must be **byte-identical** to today.
- TypeScript strict; `npm test` (vitest) and `npm run typecheck` must pass.
- Follow existing test style: fake `FetchLike` objects, no network.

## Task 1: Parse the SSO header and thread it through `searchPullRequests`

**New file `src/github/sso.ts`:**

```ts
// GitHub signals SAML-SSO-filtered responses with:
//   X-GitHub-SSO: partial-results; organizations=21955855,20582480
// Any other value (notably `required; url=...`) is not a partial-results signal.
export function parseSsoPartialOrgs(header: string | null): string[] {
  if (!header) return [];
  const [directive, rest] = header.split(";", 2);
  if (directive.trim() !== "partial-results" || !rest) return [];
  const match = /organizations=([\d,]+)/.exec(rest);
  if (!match) return [];
  return match[1].split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}
```

**Change `src/github/search.ts`:** `searchPullRequests` returns

```ts
export interface SearchResult {
  prs: PrSummary[];
  ssoPartialOrgIds: string[];
}
```

built from `parseSsoPartialOrgs(res.headers.get("x-github-sso"))`. `PrSummary`,
the query constants, the URL, and the error-throwing behavior are unchanged.

**Update the three call sites to compile against the new shape**, taking `.prs`
and ignoring `ssoPartialOrgIds` for now (Task 2 plumbs it):
- `src/onboarding.ts` (`searchPullRequests` dep type + lines 41-42)
- `src/digest.ts` (dep type + lines 19-22)
- `src/index.ts` (`listAttention` at 47-51; dep wiring at 61 and 86)

**Tests** (`src/github/search.test.ts`, plus a new `src/github/sso.test.ts`):
- `parseSsoPartialOrgs` returns `[]` for `null`, for `""`, and for
  `"required; url=https://github.com/orgs/acme/sso"`.
- `parseSsoPartialOrgs("partial-results; organizations=21955855,20582480")`
  returns `["21955855", "20582480"]`.
- `searchPullRequests` surfaces `ssoPartialOrgIds` when the header is present.
- `searchPullRequests` returns `ssoPartialOrgIds: []` when the header is absent.

## Task 2: Render the warning in `/status` and the digest

**`src/status.ts`:** add `ssoPartialOrgIds: string[]` to `AttentionList`.

Add, and append to the end of `renderBody`'s output when the array is non-empty
(exact copy — an org count, never a name):

```ts
const TOKEN_SETTINGS_URL = "https://github.com/settings/tokens";

function ssoWarning(orgIds: string[]): string {
  if (orgIds.length === 0) return "";
  const n = orgIds.length;
  return (
    `\n\n⚠️ Results are incomplete — your token isn't authorized for ${n} ` +
    `SAML SSO organization${n > 1 ? "s" : ""}. ` +
    `Authorize it at <${TOKEN_SETTINGS_URL}> → **Configure SSO**, then re-run.`
  );
}
```

The warning must sit **inside** the clamped message (it is appended in
`renderBody`, so both `formatAttention` and `formatDigest` inherit it, and
`clampMessage` still bounds the result at 2000 chars).

**`src/index.ts` `listAttention`:** union the two searches' `ssoPartialOrgIds`
(dedupe, preserve order) into the returned `AttentionList`.

**`src/digest.ts` `buildDigest`:** same union, pass into `formatDigest`.
The `incoming.length === 0 && mine.length === 0` early-return still applies —
**do not** DM a digest that contains only an SSO warning and no PRs.

**`src/onboarding.ts`:** pass the union through the same way it builds its
summary.

**Tests:** `/status` and digest render the warning when org IDs are present and
render byte-identically to today when the array is empty. Singular/plural copy.
Digest still returns `null` when both lists are empty even with SSO org IDs.

## Task 3: Detect unauthorized SSO orgs at connect time

`/user/orgs` is multi-org data, so it trips the same header. Add to
`src/github/sso.ts`:

```ts
export async function fetchSsoPartialOrgs(
  token: string,
  fetchImpl: FetchLike = defaultFetch
): Promise<string[]> {
  const res = await fetchImpl("https://api.github.com/user/orgs", {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
  });
  if (!res.ok) return []; // Non-fatal: never block a connection on this probe.
  return parseSsoPartialOrgs(res.headers.get("x-github-sso"));
}
```

**`src/discord/handlers.ts`:** add `fetchSsoPartialOrgs(token): Promise<string[]>`
to `TokenDeps`. In `handleTokenSubmit`, **after** the scope check passes and
**after** `db.upsertUser` + `onConnect` succeed, probe it. Wrap in try/catch and
treat any throw as `[]` — a failed probe must never fail a valid connection.

When non-empty, append to the existing success string:

```
✅ Connected as `<login>` via personal access token.

⚠️ Your token isn't authorized for N SAML SSO organization(s), so PRs there
won't appear. Authorize it at <https://github.com/settings/tokens> → **Configure SSO**.
```

Wire the real `fetchSsoPartialOrgs` into `tokenDeps` in `src/index.ts`.

**Tests** (`src/discord/handlers.test.ts`): success message unchanged when the
probe returns `[]`; warning appended when it returns IDs; a probe that throws
still yields the plain success message and still persists the user.

## Task 4: Stop `/link` and `/connect-token` from silently clobbering

Both write the same `users` row keyed by `discord_id`; the second command run
overwrites the first with no warning.

**`src/discord/handlers.ts`:**
- `handleLink`: if `db.getUser(ctx.userId)?.authSource === "pat"`, prefix the
  reply with:
  `⚠️ You're currently connected via \`/connect-token\`. Completing this link will replace that connection.\n\n`
- The `/connect-token` entry point (which posts `CONNECT_TOKEN_MESSAGE`; see
  `src/discord/client.ts` for where it is emitted): if
  `db.getUser(userId)?.authSource === "oauth"`, prefix with:
  `⚠️ You're currently connected via \`/link\`. Submitting a token will replace that connection.\n\n`
  Prefer exporting a `connectTokenMessage(db, userId): string` from
  `handlers.ts` over building the string in `client.ts`.

Neither command blocks or requires confirmation — warn only. No user with no
existing row sees any prefix.

**Tests:** prefix present only on the opposite `authSource`; absent for an
unconnected user and for a matching `authSource`.

---

# Addendum (decided after the first whole-branch review)

## Task 5: Warn in the digest even when there are zero PRs

**Reverses a constraint from the original plan.** The user this bug is about —
whose PRs live entirely inside the filtered org — sees zero PRs, so
`buildDigest`'s `if (incoming.length === 0 && mine.length === 0) return null`
fires and they get no digest and no warning. The quietest surface stayed quiet.

**`src/digest.ts` `buildDigest`:** compute the `ssoPartialOrgIds` union BEFORE
the empty check, then:

```ts
if (incoming.length === 0 && mine.length === 0 && ssoPartialOrgIds.length === 0) return null;
```

So: still no DM when there is genuinely nothing to say, but a warning-only
digest IS sent when results were SSO-filtered. Everything else unchanged.

**Tests:** zero PRs + non-empty `ssoPartialOrgIds` → returns a string containing
the warning. Zero PRs + empty `ssoPartialOrgIds` → still returns `null`. Non-zero
PRs → unchanged behavior.

## Task 6: Surface SSO filtering on the notifications path

`/notifications` is also a cross-org endpoint, so GitHub SSO-filters it the same
way. `fetchNotifications` discards headers, so notifications from an
unauthorized org silently never arrive.

**`src/github/notifications.ts`:** add `ssoPartialOrgIds: string[]` to
`FetchResult`, populated via `parseSsoPartialOrgs(res.headers.get("x-github-sso"))`
from `src/github/sso.ts`. Populate it on the `200` path. Existing `status`,
`items`, `lastModified`, `pollInterval` semantics are unchanged.

**`src/poller.ts`:** the poller ticks every 60s. A warning DM per tick is spam.
Warn **once per distinct org-ID set**, using the existing `meta` table
(`db.getMeta` / `db.setMeta`):

- Key: `` `sso_warned:${user.discordId}` ``
- Value: the org IDs **sorted** and joined with `,` (sorted only to make the
  dedupe key stable — never for display).
- After the `res.status !== 200` guard, before the notification loop:
  - If `res.ssoPartialOrgIds.length > 0` and `db.getMeta(key) !== value`:
    DM the warning, then `db.setMeta(key, value)`.
  - If `res.ssoPartialOrgIds.length === 0` and `db.getMeta(key)` is truthy:
    `db.setMeta(key, "")` — so that if the user later loses authorization
    again, they get warned again.
- Wrap the DM in try/catch like the other `sendDm` calls. A failed warning DM
  must never abort the notification loop, and must NOT persist the meta key
  (so it retries next tick).

**Do not** delete the user or touch `lastModified` on this path. SSO filtering
is a `200`, not a revocation — it must never reach the `401` branch.

**Tests** (`src/poller.test.ts`): warns once on first sight; does NOT warn again
on the next tick with the same org set; warns again when the org set changes;
does not warn when the set is empty; clears the meta key when filtering stops;
a throwing `sendDm` leaves the meta key unset and still processes notifications.

## Task 7: Cleanup of carried-forward Minor findings

1. `TOKEN_SETTINGS_URL` is defined twice (`src/status.ts` and
   `src/discord/handlers.ts`). Export it once from `src/status.ts` and import it
   in `handlers.ts`. The two warning strings stay worded differently per surface —
   only the URL constant is shared. If Task 6 added a third copy, fold that in too.
2. `parseSsoPartialOrgs` (`src/github/sso.ts`): normalize the directive
   comparison to be case-insensitive (`directive.trim().toLowerCase()`), and add
   the untested edge cases: leading/trailing whitespace, missing `organizations=`,
   empty org list (`organizations=`), trailing comma (`organizations=1,2,`).
   Behavior must not otherwise change; `required; url=...` must still yield `[]`.
3. `src/status.test.ts`: the "byte-identical" test's comment claims it simulates
   an `AttentionList` with no `ssoPartialOrgIds` field, but both literals set
   `ssoPartialOrgIds: []`. Fix the comment to describe what the test actually
   asserts. Do not weaken the test.

Do not change `tsconfig.json` in this task — the test-file typecheck gap is a
separate, larger follow-up.
