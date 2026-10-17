/**
 * TRACK logo.
 *
 * Artwork lives in `public/`, so the lockup can be replaced without touching
 * any code. `variant` names the surface the logo sits on and picks the matching
 * export:
 *
 *   variant="dark"  → light background → `public/logo-navy.png`  (navy lockup)
 *   variant="light" → navy background  → `public/logo-white.png` (white lockup)
 *
 * The lockup already carries the wordmark. The acronym expansion
 * ("Tracking Requirements, Attendance & Communication for KNHS") is page copy —
 * it belongs to the landing hero, the site title and the meta description — so
 * it is deliberately not rendered here.
 *
 * The browser tab icon and touch icon are separate square files, wired up in
 * `index.html` (`favicon.png`, `apple-touch-icon.png`).
 */
const ARTWORK = {
  dark: '/logo-navy.png',
  light: '/logo-white.png',
}

export default function Logo({ size = 'md', variant = 'dark' }) {
  return (
    <div className={`logo logo-${size}`}>
      <img
        className="logo-img"
        src={ARTWORK[variant] ?? ARTWORK.dark}
        alt="TRACK"
      />
    </div>
  )
}
