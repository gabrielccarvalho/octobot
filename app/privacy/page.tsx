import type { Metadata } from "next"

import { LegalPage } from "@/components/legal/legal-page"
import { COMPANY_NAME, CONTACT_EMAIL } from "@/lib/content"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What OctoBot stores, why, and how to delete it. The short version: as little as possible, encrypted, and gone the moment you run /unlink.",
}

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={`This policy explains what OctoBot collects, why, and how to remove it. ${COMPANY_NAME} is the controller of this data. The short version: we store as little as the service needs, encrypt your access token, and delete everything when you run /unlink.`}
    >
      <h2>1. What we collect</h2>
      <p>
        OctoBot is deliberately minimal. When you connect your account, we store
        only what&apos;s needed to deliver notifications to you:
      </p>
      <ul>
        <li>
          <strong>Your Discord user ID</strong> — so we know which Discord
          account to DM.
        </li>
        <li>
          <strong>Your GitHub login and access token</strong> — the token is{" "}
          <strong>encrypted at rest with AES-256-GCM</strong> and used only to
          read your GitHub notifications on your behalf.
        </li>
        <li>
          <strong>A notification watermark and per-thread dedup ledger</strong>{" "}
          — small markers that record how far we&apos;ve read, so you aren&apos;t
          notified about the same activity twice.
        </li>
        <li>
          <strong>Your preferences</strong> — the notification subject types and
          reasons you subscribe to, and whether the daily digest is on.
        </li>
        <li>
          <strong>A transient OAuth state</strong> — a single-use value that
          secures the connection flow and expires within minutes.
        </li>
      </ul>
      <p>
        We do <strong>not</strong> store the contents of your GitHub
        notifications or your repositories. Notification details are fetched from
        GitHub, formatted, sent to you as a DM, and not retained.
      </p>

      <h2>2. How we use it</h2>
      <p>We use the data above solely to:</p>
      <ul>
        <li>authenticate your connection to GitHub;</li>
        <li>
          poll GitHub for new activity, filter it against your preferences, and
          send you Discord DMs;
        </li>
        <li>send the optional daily digest, if you enable it;</li>
        <li>avoid notifying you about the same event more than once.</li>
      </ul>
      <p>
        We do not use your data for advertising, profiling, or any purpose
        unrelated to running OctoBot.
      </p>

      <h2>3. What we never do</h2>
      <ul>
        <li>
          We never <strong>sell or rent</strong> your data.
        </li>
        <li>
          We never write to your GitHub repositories or mark your notifications
          as read — access is read-only.
        </li>
        <li>
          We never log your tokens, secrets, or notification contents. Our logs
          contain only IDs, statuses, and errors.
        </li>
      </ul>

      <h2>4. Sub-processors</h2>
      <p>
        OctoBot relies on a few third parties to function. Your data passes
        through them only as needed to deliver the service:
      </p>
      <ul>
        <li>
          <strong>GitHub</strong> — the source of your notifications, accessed
          with the token you authorize.
        </li>
        <li>
          <strong>Discord</strong> — the channel through which we deliver your
          DMs.
        </li>
        <li>
          <strong>Our hosting provider</strong> — where the service runs and its
          encrypted database is stored.
        </li>
      </ul>
      <p>
        Each of these processes data under its own privacy policy. We do not
        share your data with any other third party.
      </p>

      <h2>5. Retention and deletion</h2>
      <p>
        We keep your data only while your account is connected. Running{" "}
        <code>/unlink</code> immediately disconnects your account and{" "}
        <strong>erases the record we hold about you</strong> — your encrypted
        token, watermark, dedup ledger, and preferences. You can also revoke
        OctoBot&apos;s access from your GitHub account settings at any time,
        which renders the stored token unusable.
      </p>

      <h2>6. Security</h2>
      <p>
        Access tokens are encrypted at rest with AES-256-GCM, and the encryption
        key lives only in the service environment — never in the database and
        never in logs. Connections are made over HTTPS, and the OAuth flow is
        protected against cross-site request forgery with a single-use,
        time-limited state. No system is perfectly secure, but we design
        OctoBot to hold as little as possible and to protect what it must hold.
      </p>

      <h2>7. International users</h2>
      <p>
        OctoBot may process and store your data on servers located outside your
        country. By using the service, you consent to that transfer and
        processing.
      </p>

      <h2>8. Children</h2>
      <p>
        OctoBot is not directed to children. You must meet the minimum age
        required to use Discord and GitHub in your country to use the service,
        and we do not knowingly collect data from anyone below that age.
      </p>

      <h2>9. Your rights</h2>
      <p>
        Depending on where you live, you may have the right to access, correct,
        export, or delete the personal data we hold about you, or to object to
        or restrict its processing. You can delete your data yourself at any time
        with <code>/unlink</code>; for any other request, contact us using the
        details below.
      </p>

      <h2>10. Changes to this policy</h2>
      <p>
        We may update this policy from time to time. When we do, we&apos;ll
        revise the &quot;last updated&quot; date above and, for material changes,
        make a reasonable effort to notify connected users.
      </p>

      <h2>11. Contact</h2>
      <p>
        For any privacy question or request, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  )
}
