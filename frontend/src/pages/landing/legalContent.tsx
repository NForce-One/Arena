
export const LEGAL_UPDATED = 'August 2026';

export function TermsContent() {
  return (
    <>
      <p>
        These terms govern your use of NForce Arena. By creating an account or browsing a public
        tournament page, you agree to them.
      </p>

      <h2>Accounts</h2>
      <p>
        You&apos;re responsible for the accuracy of the information on your account and for keeping
        your password secure. Every account starts as a player; other roles (organizer, team
        manager, ground owner, umpire) are added on top, either at signup pending admin approval, or
        granted directly by a platform admin.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Don&apos;t enter results, fixtures or listings you know to be false.</li>
        <li>
          Don&apos;t use another person&apos;s account or impersonate an organizer, umpire or ground
          owner you aren&apos;t.
        </li>
        <li>
          Don&apos;t attempt to bypass the role or capacity checks enforced on bookings,
          registrations and appointments.
        </li>
      </ul>

      <h2>Content you submit</h2>
      <p>
        Fixture details, results, team rosters, ground listings and announcements you submit are
        yours, but by publishing a tournament or listing you&apos;re authorizing NForce Arena to
        display that content publicly (for tournaments) or to the relevant participants (for
        team/roster data), exactly as the platform&apos;s existing visibility rules describe.
      </p>

      <h2>Availability</h2>
      <p>
        NForce Arena is provided on an &quot;as-is&quot; basis. We work to keep fixtures, bookings
        and results accurate and available, but we don&apos;t guarantee uninterrupted access, and
        we&apos;re not liable for disputes arising from a match, booking or appointment organized
        through the platform. Those are between the organizer, teams, ground owner and umpire
        involved.
      </p>

      <h2>Suspension</h2>
      <p>
        We may suspend or remove an account that violates these terms, most commonly for submitting
        false results or fixtures, or abusing the booking/registration system.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms as the platform grows. Material changes will be reflected here
        with an updated date at the top of the page.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <a href="mailto:arena@nforceone.com">arena@nforceone.com</a>.
      </p>
    </>
  );
}

export function PrivacyContent({ onCookiesClick }: { onCookiesClick?: () => void } = {}) {
  return (
    <>
      <p>
        This policy explains what NForce Arena (&quot;we&quot;, &quot;us&quot;) collects when you
        use the platform, and how it&apos;s used. It applies to every account type: player, team
        manager, organizer, ground owner, umpire and admin.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details</strong>: name, email address, password (stored as a salted hash,
          never in plain text) and, optionally, date of birth for age group eligibility.
        </li>
        <li>
          <strong>Profile content</strong>: a profile photo if you choose to upload one, and the
          team/tournament activity your account is naturally part of (registrations, rosters,
          bookings, results).
        </li>
        <li>
          <strong>Usage data</strong>: request logs (IP address, timestamp, endpoint) kept for
          security and abuse prevention, and an audit trail of account and role changes.
        </li>
      </ul>

      <h2>How we use it</h2>
      <p>
        To run the features you&apos;d expect: signing you in, showing fixtures and results to the
        right audience, sending the transactional emails a season depends on (verification, password
        resets, booking and role notifications), and keeping the platform secure. We do not sell
        your data, and we do not use it for advertising.
      </p>

      <h2>Public information</h2>
      <p>
        Tournament fixtures, results, standings and public player profiles are, by design, visible
        to anyone without an account. That&apos;s the point of a public scorebook. A tournament
        stays private (draft) until its organizer publishes it. Your email address and password are
        never shown publicly.
      </p>

      <h2>Cookies</h2>
      <p>
        We use a small number of strictly necessary cookies to keep you signed in. See our{' '}
        {onCookiesClick ? (
          <button type="button" className="btn-link" onClick={onCookiesClick}>
            Cookie Policy
          </button>
        ) : (
          <a href="/cookies">Cookie Policy</a>
        )}{' '}
        for the full list.
      </p>

      <h2>Data retention</h2>
      <p>
        Account and activity data is kept for as long as your account is active. You can ask us to
        delete your account and associated personal data at any time by writing to us. We&apos;ll
        retain only what a completed tournament&apos;s results and audit trail legally need to keep
        (e.g. who entered a result and when).
      </p>

      <h2>Your rights</h2>
      <p>
        You can access, correct or delete your personal information from your profile settings, or
        by contacting us directly. If you believe your data has been handled incorrectly, write to
        us and we&apos;ll look into it.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy: <a href="mailto:arena@nforceone.com">arena@nforceone.com</a>.
      </p>
    </>
  );
}

export function CookiesContent() {
  return (
    <>
      <p>
        NForce Arena uses one cookie. That&apos;s it: no advertising cookies, no third-party
        trackers, no analytics pixels.
      </p>

      <h2>Strictly necessary</h2>
      <ul>
        <li>
          <strong>
            <code>NFA_RT</code>
          </strong>{' '}
          : keeps you signed in between visits. It holds a rotating session token, not your
          password, and is marked HTTP-only (JavaScript can never read it) and secure. It&apos;s
          cleared the moment you log out.
        </li>
      </ul>
      <p>
        Because this cookie is what keeps your session alive, it can&apos;t be turned off without
        also turning off the ability to stay signed in. There&apos;s no separate consent banner for
        it, the same way there isn&apos;t one for a login form itself.
      </p>

      <h2>Local storage, not cookies</h2>
      <p>
        Your light/dark theme preference is remembered in your browser&apos;s local storage, not a
        cookie. It never leaves your device and isn&apos;t sent to our servers on every request the
        way a cookie is.
      </p>

      <h2>Questions</h2>
      <p>
        Write to <a href="mailto:arena@nforceone.com">arena@nforceone.com</a> if anything here is
        unclear.
      </p>
    </>
  );
}
