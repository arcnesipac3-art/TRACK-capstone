import { useEffect, useRef } from 'react'
import PublicNav from '../components/PublicNav'
import PublicFooter from '../components/PublicFooter'
import { POLICY_UPDATED } from '../config/legal'


/* Self-hosted campus photograph; the navy wash above it carries the text contrast. */
const HERO_BG_URL = '/campus-hero.jpg';

const TOC = [
  { id: 'what',         label: '1. What TRACK is' },
  { id: 'acceptance',   label: '2. Acceptance of these terms' },
  { id: 'accounts',     label: '3. Accounts and access' },
  { id: 'authorized',   label: '4. Authorized use' },
  { id: 'records',      label: '5. What you enter, and who owns it' },
  { id: 'fees',         label: '6. Charges — there are none' },
  { id: 'availability', label: '7. Availability and changes' },
  { id: 'termination',  label: '8. Suspension and termination' },
  { id: 'property',     label: '9. Intellectual property' },
  { id: 'liability',    label: '10. Disclaimer and liability' },
  { id: 'law',          label: '11. Governing law and complaints' },
]

export default function TermsPage() {
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
    const NAV_H = 80

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
        <section className="lp-hero" aria-labelledby="terms-heading">
          <div className="lp-hero-inner">
            <p className="lp-eyebrow">Legal</p>
            <h1 id="terms-heading">Terms &amp; Conditions</h1>
            <p className="lp-lede">
              Please read these terms carefully before using the TRACK School Management System.
            </p>
            <p className="lp-meta">Last Updated: {POLICY_UPDATED}</p>
          </div>
        </section>

        <section className="lp-layout">
          {/*  Table of contents  */}
          <details className="lp-toc" open>
            <summary>Table of Contents</summary>
            <nav className="lp-toc-list" aria-label="Terms & conditions sections">
              {TOC.map((item) => (
                <a key={item.id} href={`#${item.id}`}>{item.label}</a>
              ))}
            </nav>
          </details>

          {/*  Document body  */}
          <article className="lp-doc">
            <section className="lp-section" id="what">
              <h2>1. What TRACK is</h2>
              <p>
                TRACK — Tracking Requirements, Attendance &amp; Communication — is
                the record-keeping portal Kiwalan National High School uses for
                enrollment, attendance, requirements, fees and school messaging.
                It began as a student research thesis and is operated by the
                school; the school, not the developers, decides what the records
                mean.
              </p>
              <p>
                TRACK is a tool for reading and recording school data. It is not
                itself the authority on any of it: where TRACK and the school&rsquo;s
                official books disagree, the school&rsquo;s books govern, and the
                registrar is the office that corrects either.
              </p>
            </section>

            <section className="lp-section" id="acceptance">
              <h2>2. Acceptance of these terms</h2>
              <p>
                By using TRACK you agree to these terms and to the laws of the
                Republic of the Philippines that apply to school records, including
                the Data Privacy Act of 2012 (RA 10173). If you are enrolling a
                learner who is under 18, you are confirming that you are that
                learner&rsquo;s parent or legal guardian and that you may give that
                consent.
              </p>
              <p>
                Continued use after a change to these terms means the changed terms
                apply. Material changes are announced in the app before they take
                effect.
              </p>
            </section>

            <section className="lp-section" id="accounts">
              <h2>3. Accounts and access</h2>
              <ul>
                <li>
                  Accounts are issued by the school registrar. There is no
                  self-sign-up: a learner account is created when an enrollment is
                  confirmed, and a parent or guardian account is created through
                  the claim link the registrar sends.
                </li>
                <li>
                  An account is personal to the person it was issued to. You are
                  responsible for keeping your password to yourself; sharing it is
                  how records get altered by someone the audit trail then cannot
                  attribute properly.
                </li>
                <li>
                  What an account can see is decided on the server by its role and
                  its assignment — a teacher sees their own classes, a parent sees
                  their own children. No setting on this site changes that.
                </li>
                <li>
                  Tell the registrar immediately if you believe someone else has
                  used your account.
                </li>
              </ul>
            </section>

            <section className="lp-section" id="authorized">
              <h2>4. Authorized use</h2>
              <p>TRACK is for the learners, parents, teachers and staff it serves. You agree not to:</p>
              <ul>
                <li>Use it for anything unlawful, or to record anything you know to be false.</li>
                <li>Try to reach another person&rsquo;s record, or to make the system do something its role rules do not allow.</li>
                <li>Submit false attendance, false requirement entries, or documents that are not what they claim to be.</li>
                <li>Interfere with the service, probe it for weaknesses without the school&rsquo;s written permission, or automate logins.</li>
                <li>Upload anything unlawful, or anything the school has not asked you to upload.</li>
              </ul>
            </section>

            <section className="lp-section" id="records">
              <h2>5. What you enter, and who owns it</h2>
              <p>
                Entries you make — an application, a submitted requirement, a
                message — become part of the school&rsquo;s records and are handled
                under the same rules as any other school document. You keep the
                rights to what you author; by filing it you give the school the
                permission it needs to store, review and disclose it as section 6
                of the Privacy Policy describes.
              </p>
              <p>
                Documents you upload should be the learner&rsquo;s own. Do not file
                another student&rsquo;s papers to someone else&rsquo;s application.
              </p>
            </section>

            <section className="lp-section" id="fees">
              <h2>6. Charges — there are none</h2>
              <ul>
                <li>TRACK does not charge for anything: no fee, no subscription, no trial that turns into a bill, no in-app payment of any kind.</li>
                <li>TRACK cannot take payment. Where a balance is shown, it is a figure the school has assessed; it is settled at the school, and the app only reflects it.</li>
                <li>Nothing in TRACK is conditional on a purchase, and no feature is held back behind a payment.</li>
              </ul>
            </section>

            <section className="lp-section" id="availability">
              <h2>7. Availability and changes</h2>
              <p>
                TRACK is an operational aid, not a guaranteed service. It may be
                unavailable for maintenance, for a school event, or for a fault, and
                no uptime level is promised. Features change as the school&rsquo;s
                processes change; where a change affects what is collected or who
                can see it, the Privacy Policy and the enrollment consent are
                updated with it.
              </p>
            </section>

            <section className="lp-section" id="termination">
              <h2>8. Suspension and termination</h2>
              <p>
                The school may suspend or close an account that breaches these
                terms or that puts the integrity of school records at risk. Closing
                an account removes access; it does not delete the records the school
                is required to keep, and those records remain subject to the
                Privacy Policy. A decision to suspend a learner&rsquo;s access is a
                school decision, made by the administration, and is open to the
                school&rsquo;s own appeal process.
              </p>
            </section>

            <section className="lp-section" id="property">
              <h2>9. Intellectual property</h2>
              <p>
                The TRACK software, its interface and its name belong to those who
                built it and are used by Kiwalan National High School under the
                school&rsquo;s research agreement. The KNHS seal and the school&rsquo;s
                name belong to the school. Nothing in these terms transfers either
                to a user, and copying the software for use outside the school
                requires the written permission of the developers and the school.
              </p>
              <p>
                Learner data is not anyone&rsquo;s intellectual property. It is
                personal information, and it is governed by the Privacy Policy
                rather than by this section.
              </p>
            </section>

            <section className="lp-section" id="liability">
              <h2>10. Disclaimer and liability</h2>
              <p>
                TRACK is provided as it is, without warranty that it is error-free
                or uninterrupted. The school remains responsible for the accuracy of
                learner records and for the decisions taken on them; the software
                does not replace that responsibility. To the extent Philippine law
                allows, neither the school nor the developers are liable for indirect
                or consequential loss arising from use of, or inability to use, the
                portal.
              </p>
              <p>
                Nothing here limits a right that cannot lawfully be limited —
                including your rights under the Data Privacy Act, and the school&rsquo;s
                duty of care towards its learners.
              </p>
            </section>

            <section className="lp-section" id="law">
              <h2>11. Governing law and complaints</h2>
              <p>
                These terms are governed by the law of the Republic of the
                Philippines, with the DepEd orders applying to basic education and
                the Data Privacy Act applying to personal information. Disputes
                begin at the school: raise the matter with the registrar, then with
                the administration. Data protection complaints may be taken to the
                National Privacy Commission, and DepEd-related complaints to the
                schools division office of Iligan City.
              </p>
              <p>
                The school is at Purok 10 Mato-og, Kiwalan, Iligan City, Lanao del
                Norte 9200.
              </p>
            </section>
          </article>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}