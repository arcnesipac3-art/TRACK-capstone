import './loading.css'

/**
 * Compact spinner for the button that started a request.
 *
 * Purely decorative — the surrounding control carries `aria-busy` and swaps
 * its own label ("Saving…"), so screen readers hear the state change from the
 * button text rather than from a second announcement.
 */
export default function ButtonLoader() {
  return <span className="btn-spinner" aria-hidden="true" />
}
