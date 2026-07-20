import type { Metadata } from "next"

import { LegalPage } from "@/components/legal/legal-page"
import {
  COMPANY_NAME,
  COMPANY_LEGAL_NAME,
  CONTACT_EMAIL,
  GOVERNING_LAW,
  JURISDICTION_FORUM,
} from "@/lib/content"

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of OctoBot.",
}

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={`These terms are a binding agreement between you and ${COMPANY_NAME}, operated by ${COMPANY_LEGAL_NAME} ("we", "us"). By adding OctoBot to a Discord server or connecting your GitHub account, you agree to them.`}
    >
      <h2>1. The service</h2>
      <p>
        OctoBot is a Discord bot that reads your GitHub notifications and sends
        you a Discord direct message when activity needs your attention — review
        requests, mentions, CI results, approvals, and similar events across the
        repositories your GitHub account can access. It also offers an optional
        once-a-day summary of pull requests awaiting your review.
      </p>
      <p>
        OctoBot is provided by us on an ongoing basis. We may add, change, or
        remove features at any time.
      </p>

      <h2>2. Eligibility and accounts</h2>
      <p>
        You must be at least 13 years old, or the minimum age required to use
        Discord and GitHub in your country, whichever is higher. You are
        responsible for the Discord and GitHub accounts you connect and for all
        activity that occurs through them while connected to OctoBot.
      </p>

      <h2>3. Connecting your GitHub account</h2>
      <p>
        To use OctoBot you authorize it to access your GitHub account, either
        through GitHub&apos;s OAuth flow or with a Personal Access Token you
        provide. GitHub requires the <strong>repo</strong> scope to expose
        private-repository notifications; granting it gives the token broad
        read and write access to your repositories at the GitHub level.
      </p>
      <p>
        In operation, OctoBot uses this access <strong>read-only</strong>. It
        reads your notifications and related pull-request data in order to notify
        you. It does not mark your GitHub notifications as read, post comments,
        or otherwise write to your repositories. You should only connect an
        account you are comfortable granting this access to, and you may revoke
        it at any time from your GitHub settings or by running{" "}
        <code>/unlink</code>.
      </p>

      <h2>4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>
          use OctoBot to access notifications or repositories you are not
          authorized to access;
        </li>
        <li>
          probe, disrupt, overload, or attempt to gain unauthorized access to
          the service or its underlying infrastructure;
        </li>
        <li>
          reverse engineer, resell, or sublicense the service except as
          permitted by law;
        </li>
        <li>use the service to violate GitHub&apos;s or Discord&apos;s terms.</li>
      </ul>

      <h2>5. Third-party services</h2>
      <p>
        OctoBot depends on Discord and GitHub. Your use of those platforms is
        governed by their own terms and policies, and we are not responsible for
        them. OctoBot is an independent product and is{" "}
        <strong>not affiliated with, endorsed by, or sponsored by</strong>{" "}
        GitHub, Inc. or Discord Inc. GitHub and Discord are trademarks of their
        respective owners.
      </p>

      <h2>6. Availability</h2>
      <p>
        We aim to keep OctoBot running reliably, but we do not guarantee that it
        will be uninterrupted, timely, or error-free. Notification delivery
        depends on Discord, GitHub, and network conditions outside our control,
        and delivery may be delayed or missed. OctoBot is not a substitute for
        monitoring critical systems directly.
      </p>

      <h2>7. Disclaimers</h2>
      <p>
        The service is provided <strong>&quot;as is&quot; and &quot;as
        available&quot;</strong>, without warranties of any kind, whether
        express, implied, or statutory, including any implied warranties of
        merchantability, fitness for a particular purpose, and non-infringement.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, {COMPANY_NAME} will not be
        liable for any indirect, incidental, special, consequential, or punitive
        damages, or for any loss of profits, data, or goodwill, arising out of
        or relating to your use of — or inability to use — OctoBot, including any
        missed, delayed, or incorrect notification. Our total aggregate
        liability for any claim relating to the service will not exceed the
        greater of the amount you paid us for the service in the twelve months
        before the claim, or USD 50.
      </p>

      <h2>9. Termination</h2>
      <p>
        You may stop using OctoBot at any time by running <code>/unlink</code>,
        which disconnects your account and removes the data we store about you,
        and by removing the bot from your Discord server. We may suspend or
        terminate access to the service, in whole or in part, if you breach
        these terms or to protect the service or other users.
      </p>

      <h2>10. Changes to these terms</h2>
      <p>
        We may update these terms from time to time. When we do, we will revise
        the &quot;last updated&quot; date above. Your continued use of OctoBot
        after changes take effect constitutes acceptance of the revised terms.
      </p>

      <h2>11. Governing law and venue</h2>
      <p>
        These terms are governed by the laws of {GOVERNING_LAW}, without regard
        to its conflict-of-laws rules. The parties elect {JURISDICTION_FORUM} as
        the exclusive venue for any dispute arising from them, waiving any other,
        however privileged.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about these terms? Email us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  )
}
