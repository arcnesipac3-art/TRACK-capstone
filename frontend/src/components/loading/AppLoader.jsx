import Logo from '../Logo'
import './loading.css'

/**
 * Full-screen branded loading screen.
 *
 * Reserved for moments where the application really is initialising and the
 * interface must stay blocked — the session restore behind a protected route,
 * and the session check on /login. Ordinary requests never reach this
 * component: they use `PageLoader`, `Skeleton` variants or `InlineLoader`.
 *
 * It uses the shipped TRACK lockup (`public/logo-navy.png`, via `Logo`) on a
 * plain white surface, with a short indeterminate progress line. There is no
 * percentage because the app cannot know how far along it is.
 */
export default function AppLoader({ label = 'Loading your workspace…' }) {
  return (
    <div className="app-loader" role="status" aria-live="polite" aria-busy="true">
      <div className="app-loader-inner">
        <Logo size="lg" />
        <span className="app-loader-track" aria-hidden="true" />
        <p className="app-loader-label">{label}</p>
      </div>
    </div>
  )
}
