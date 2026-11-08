import PublicNav from '../../components/PublicNav'
import PublicFooter from '../../components/PublicFooter'
import EnrollmentPortal from './EnrollmentPortal'
import './EnrollmentPages.css'

/**
 * Shell for the public (account-less) enrollment portal at /enroll.
 *
 * Reuses the `res-page` chrome of the other public pages (navy route-fade
 * stage, sticky PublicNav, light content area) so anonymous visitors get the
 * same look as /about and /researchers, while every child route renders
 * inside the same stack the signed-in applicant portal uses.
 *
 * The footer is mounted here rather than on each child because this portal
 * collects the most personal data of any surface in the app — names, LRN,
 * contact details and uploaded documents, filed by people who do not have an
 * account and are not looking at any other page of the school's site.
 */
export default function PublicEnrollLayout() {
  return (
    <div className="res-page">
      <PublicNav />
      <main className="res-main enr-public-main">
        <div className="enr-public-container">
          <EnrollmentPortal />
        </div>
      </main>
      <PublicFooter variant="compact" />
    </div>
  )
}
