import { useEffect, useRef } from 'react'
import PublicNav from '../components/PublicNav'
import PublicFooter from '../components/PublicFooter'
import { POLICY_UPDATED } from '../config/legal'


/* Self-hosted campus photograph; the navy wash above it carries the text contrast. */
const HERO_BG_URL = '/campus-hero.jpg';

const TOC = [
  { id: 'controller',   label: '1. Who is responsible for your data' },
  { id: 'collect',      label: '2. Information we collect' },
  { id: 'use',          label: '3. What we use it for' },
  { id: 'basis',        label: '4. Legal basis and consent' },
  { id: 'cookies',      label: '5. Cookies and what is stored on your device' },
  { id: 'disclosure',   label: '6. Who else may see it' },
  { id: 'minors',       label: '7. Learners under 18 and guardian consent' },
  { id: 'retention',    label: '8. How long we keep it' },
  { id: 'rights',       label: '9. Your rights' },
  { id: 'protection',   label: '10. Keeping it safe' },
  { id: 'changes',      label: '11. Changes to this policy' },
]

export default function PrivacyPage() {
  const pageRef = useRef(null)

  useEffect(() => {
    const root = pageRef.current
    if (!root) return undefined
    root.style.setProperty('--res-hero-bg', `url("${HERO_BG_URL}")`)
    let cancelled = false
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      if (!cancelled) root.classList.add('bg-ready')
    }
    img.src = HERO_BG_URL
    return () => {
      cancelled = true
      img.onload = null
    }
  }, [])

  // Smooth-scroll TOC links within the res-page scroll container
  useEffect(() => {
    const container = pageRef.current
    if (!container) return undefined
    const NAV_H = 80 // nav height + a little breathing room

    function handleClick(e) {
      const anchor = e.target.closest('.lp-toc-list a[href^="#"]')
      if (!anchor) return
      const id = anchor.getAttribute('href').slice(1)
      const target = document.getElementById(id)
      if (!target) return
      e.preventDefault()
      const targetTop = target.getBoundingClientRect().top
      const containerTop = container.getBoundingClientRect().top
      const offset = targetTop - containerTop + container.scrollTop - NAV_H
      container.scrollTo({ top: offset, behavior: 'smooth' })
    }

    container.addEventListener('click', handleClick)
    return () => container.removeEventListener('click', handleClick)
  }, [])

  return (
    <div className="res-page" ref={pageRef}>
      <PublicNav />

      <main className="res-main">
        <section className="lp-hero" aria-labelledby="privacy-heading">
          <div className="lp-hero-inner">
            <p className="lp-eyebrow">Data Protection</p>
            <h1 id="privacy-heading">Privacy Policy</h1>
            <p className="lp-lede">
              How we collect, use, and protect your information at Kiwalan National High School.
            </p>
            <p className="lp-meta">Last Updated: {POLICY_UPDATED}</p>
          </div>
        </section>

        <section className="lp-layout">
          {/*  Table of contents  */}
          <details className="lp-toc" open>
            <summary>Table of Contents</summary>
            <nav className="lp-toc-list" aria-label="Privacy policy sections">
              {TOC.map((item) => (
                <a key={item.id} href={`#${item.id}`}>{item.label}</a>
              ))}
            </nav>
          </details>

          {/*  Document body  */}
          <article className="lp-doc">
            <section className="lp-section" id="controller">
              <h2>1. Who is responsible for your data</h2>
              <p>
                Kiwalan National High School is the personal information controller
                for everything TRACK holds. It decides what is collected, why, and
                who may see it. The school is reached at Purok 10 Mato-og, Kiwalan,
                Iligan City, Lanao del Norte 9200; questions about your data, and
                any request described in section 9, go to the registrar&rsquo;s
                office, which issues and administers every TRACK account.
              </p>
              <p>
                TRACK is a student research project built for and operated by the
                school. It is not a commercial service, it does not advertise, and
                no one is paid to place anything in front of you here.
              </p>
            </section>

            <section className="lp-section" id="collect">
              <h2>2. Information we collect</h2>
              <p>Only what a school needs to run a school — nothing is collected on speculation:</p>
              <ul>
                <li>
                  <strong>Identity.</strong> Name, Learner Reference Number (LRN),
                  date of birth, sex, address, contact number and email address.
                </li>
                <li>
                  <strong>Guardian details.</strong> Name, relationship, contact
                  number and email, so the school can reach a parent or guardian.
                </li>
                <li>
                  <strong>School records.</strong> Section and grade level, the
                  strand for Senior High School, previous school, attendance
                  sessions, requirement submissions and their verification status,
                  and fee balances.
                </li>
                <li>
                  <strong>Documents you file.</strong> The files you upload for
                  enrollment, in the formats the checklist names.
                </li>
                <li>
                  <strong>Messages.</strong> What you write in TRACK&rsquo;s
                  messaging, and the announcements the school sends you.
                </li>
                <li>
                  <strong>Delivery details.</strong> If you switch on browser
                  notifications, the subscription endpoint your browser gives us,
                  and the device label you choose.
                </li>
                <li>
                  <strong>Account activity.</strong> When a staff member views,
                  changes, decides on or deletes a record, the account responsible,
                  the record affected, and the IP address the action arrived from.
                  This is the audit trail, and it exists so that a disputed change
                  to a learner&rsquo;s record can be traced to who made it.
                </li>
              </ul>
              <p>
                TRACK does not ask for, and should not be given, health records,
                financial account numbers, or anything outside the list above.
              </p>
            </section>

            <section className="lp-section" id="use">
              <h2>3. What we use it for</h2>
              <ul>
                <li>Processing and deciding enrollment applications.</li>
                <li>Recording attendance and releasing requirements and certificates.</li>
                <li>Showing a learner&rsquo;s own record to that learner, and a child&rsquo;s record to their registered parent or guardian.</li>
                <li>Communicating school announcements, decisions and reminders.</li>
                <li>Producing the reports the school owes the Department of Education.</li>
                <li>Keeping an accountable record of administrative actions.</li>
              </ul>
              <p>
                There is no other use. Your data is not used for advertising, is not
                profiled, is not sold, and is not handed to any analytics service.
              </p>
            </section>

            <section className="lp-section" id="basis">
              <h2>4. Legal basis and consent</h2>
              <p>
                Processing follows the Data Privacy Act of 2012 (Republic Act No.
                10173) and its Implementing Rules and Regulations, together with the
                Department of Education&rsquo;s authority over learner records.
              </p>
              <ul>
                <li>
                  <strong>Consent</strong> is sought at the point of enrollment for
                  the collection itself, and is recorded with the date it was given
                  and the version of this policy that was shown when it was given.
                </li>
                <li>
                  <strong>Legal obligation</strong> covers the records the school is
                  required to keep and report whether or not anyone consents.
                </li>
                <li>
                  <strong>Vital interests and the school&rsquo;s mandate</strong>
                  cover attendance and safeguarding-related contact.
                </li>
              </ul>
              <p>
                Consent can be withdrawn at any time by writing to the registrar.
                Withdrawing it stops future processing that rests on consent; it
                cannot remove records the school is independently obliged to keep.
              </p>
            </section>

            <section className="lp-section" id="cookies">
              <h2>5. Cookies and what is stored on your device</h2>
              <ul>
                <li>
                  <strong>Signing in</strong> stores your access token in your
                  browser&rsquo;s <em>session storage</em>, which is cleared when you
                  close the tab, and sets a session cookie on the school&rsquo;s own
                  server so it knows you are the account that just signed in. Both
                  are strictly necessary; neither is used to recognise you on other
                  sites.
                </li>
                <li>
                  <strong>Nothing else is set.</strong> TRACK has no analytics,
                  no advertising or social pixels, no third-party scripts, and no
                  cross-site tracking cookies.
                </li>
                <li>
                  <strong>Notifications</strong> are registered with the push
                  service your browser already uses (for example the one built into
                  Chrome or Edge). That registration is a request to a company other
                  than the school, which is why notifications are something you
                  switch on deliberately rather than something turned on for you.
                </li>
                <li>
                  <strong>The map on the Location page</strong> is Google&rsquo;s.
                  It is not loaded when you open the page. It loads when you press
                  &ldquo;Load the map from Google&rdquo;, and until you press it no
                  request goes to Google and no Google cookie is set.
                </li>
              </ul>
              <p>
                Because there is nothing optional to consent to, TRACK shows no
                cookie banner. If a future version adds one, it will be because
                something non-essential was added, and the choice will be yours.
              </p>
            </section>

            <section className="lp-section" id="disclosure">
              <h2>6. Who else may see it</h2>
              <p>
                We do not sell or rent personal information, and we do not share it
                for marketing. It reaches others only in these specific ways:
              </p>
              <ul>
                <li>
                  <strong>Inside the school</strong> — a teacher sees the learners in
                  the classes they are assigned; an adviser sees their own section;
                  a registrar or administrator sees what their role grants. A
                  learner sees only their own record, and a parent sees only the
                  children linked to their account. These limits are enforced by the
                  server on every request, not by what the screen happens to show.
                </li>
                <li>
                  <strong>The Department of Education</strong>, for the reporting the
                  school is required to file.
                </li>
                <li>
                  <strong>Our hosting and email providers</strong>, which carry the
                  system and deliver messages on the school&rsquo;s instructions and
                  not for their own purposes.
                </li>
                <li>
                  <strong>Anyone with a lawful right to it</strong> — a court order
                  or a valid request from the National Privacy Commission.
                </li>
              </ul>
            </section>

            <section className="lp-section" id="minors">
              <h2>7. Learners under 18 and guardian consent</h2>
              <p>
                Most learners on TRACK are minors, so their enrollment is filed and
                consented to by a parent or guardian, and a minor&rsquo;s own account
                is created only after the school has confirmed the application and
                issued a one-time claim link to the guardian&rsquo;s email address.
              </p>
              <ul>
                <li>A minor may object to a use of their data in the same way an adult may; the school responds to that objection.</li>
                <li>Where processing would harm or embarrass a learner, the school applies the Data Privacy Act&rsquo;s rule that the best interests of the child prevail.</li>
                <li>Guidance counsellors and class advisers see a learner&rsquo;s record only to the extent their assignment requires it.</li>
              </ul>
            </section>

            <section className="lp-section" id="retention">
              <h2>8. How long we keep it</h2>
              <ul>
                <li>
                  <strong>Enrollment applications and the documents filed with
                  them</strong> are kept as the evidence for a decision that changed
                  a learner&rsquo;s status, and are not deleted when an application
                  is rejected.
                </li>
                <li>
                  <strong>Academic and attendance records</strong> are kept for the
                  period the Department of Education and the National Archives
                  require a school to keep learner records. A permanent student
                  record is the reason a former learner can come back years later
                  and ask for a transcript, so this is the one category TRACK cannot
                  delete on request — and the reason is stated rather than hidden.
                </li>
                <li>
                  <strong>Messages and announcements</strong> are kept while the
                  conversation remains part of school communication, and are removed
                  when the school no longer has a reason for them.
                </li>
                <li>
                  <strong>Audit entries</strong> are kept so that a past change to a
                  record can still be attributed. Deleting them would delete the
                  accountability they exist to provide.
                </li>
                <li>
                  <strong>Push subscriptions</strong> are deleted as soon as you turn
                  notifications off, or when an account is closed.
                </li>
              </ul>
            </section>

            <section className="lp-section" id="rights">
              <h2>9. Your rights</h2>
              <p>Under the Data Privacy Act you may exercise these rights, free of charge:</p>
              <ul>
                <li><strong>Be informed</strong> — this policy, and the checklist at enrollment, tell you what is held and why.</li>
                <li><strong>Access</strong> — your own dashboard already shows your record; a signed-in learner or guardian can take a complete machine-readable copy of what TRACK holds about them from the <strong>My data</strong> section of their profile, and file a correction, objection or deletion request from the same place.</li>
                <li><strong>Correct and update</strong> — through the enrollment office, which is the office that can lawfully amend a school record.</li>
                <li><strong>Object</strong> — to processing that rests on consent, and to specific notices.</li>
                <li><strong>Delete</strong> — you may ask for your record to be removed. The school will remove what it is permitted to remove and will tell you, in writing, which records it is required by law to keep and why. A request is never ignored; sometimes the honest answer is a refusal with a reason.</li>
                <li><strong>Data portability</strong> — the export above is provided in a format you can hand to another institution.</li>
              </ul>
              <p>
                Requests go to the registrar&rsquo;s office at the address in
                section 1. If you are not satisfied with the school&rsquo;s answer,
                you may complain to the National Privacy Commission of the
                Philippines.
              </p>
            </section>

            <section className="lp-section" id="protection">
              <h2>10. Keeping it safe</h2>
              <ul>
                <li>Passwords are stored only as salted hashes, never as text.</li>
                <li>Authorization is checked on the server for every request, so a screen you cannot see is also a request the server will refuse.</li>
                <li>In production the site is served over HTTPS with strict transport security, and session cookies are marked secure and HTTP-only.</li>
                <li>Sign-in attempts are rate-limited, and administrative actions are logged.</li>
                <li>Access is limited to the people who need it for their assignment, and accounts are issued and withdrawn by the registrar.</li>
              </ul>
              <p>
                No system is perfectly secure. If a breach leaves personal
                information at risk, the school notifies the National Privacy
                Commission and the affected individuals as the law requires.
              </p>
            </section>

            <section className="lp-section" id="changes">
              <h2>11. Changes to this policy</h2>
              <p>
                This page is the current version, and its date is printed at the top.
                Material changes are announced in the app before they take effect,
                and where a change alters what we do with data that was collected
                under consent, the school asks for that consent again rather than
                treating the old one as covering the new.
              </p>
            </section>
          </article>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}