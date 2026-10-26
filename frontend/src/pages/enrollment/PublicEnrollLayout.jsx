import PublicNav from '../../components/PublicNav'
import EnrollmentPortal from './EnrollmentPortal'
import './EnrollmentPages.css'

/**
 * Shell for the public (account-less) enrollment portal at /enroll.
 *
 * Reuses the `res-page` chrome of the other public pages (navy route-fade
 * stage, sticky PublicNav, light content area) so anonymous visitors get the
 * same look as /about and /researchers, while every child route renders
 * inside the same stack the signed-in applicant portal uses.
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
    </div>
  )
}
