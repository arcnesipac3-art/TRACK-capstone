import { useId } from 'react'
import { Link } from 'react-router-dom'
import { POLICY_UPDATED } from '../../config/legal'

/**
 * The consent tick that gates an enrollment submission.
 *
 * It is not decoration: the backend refuses a submit or resubmit that arrives
 * without it and stamps the notice version on the application, so this is the
 * record of what the applicant agreed to. The box starts empty every time the
 * dialog opens — a pre-ticked box is the dark pattern the law calls out.
 *
 * `purpose` closes the sentence, because the two places that ask for consent
 * do different things with the data: filing an application versus opening the
 * account that will hold it.
 */
const SUBMIT_PURPOSE =
  'and agree that the school may keep and use the information on this application to process the enrollment.'

export default function ConsentCheckbox({
  checked,
  onChange,
  disabled,
  purpose = SUBMIT_PURPOSE,
}) {
  // The two notices are real links, so the wording cannot sit inside the
  // <label> — activating a link would toggle the box on the way to /privacy.
  const boxId = useId()
  return (
    <div className="enr-consent">
      <input
        id={boxId}
        type="checkbox"
        className="enr-consent-box"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <label className="enr-consent-text" htmlFor={boxId}>
        I have read the <Link to="/privacy" target="_blank" rel="noreferrer">Privacy Notice</Link>{' '}
        and the <Link to="/terms" target="_blank" rel="noreferrer">Terms of Service</Link> ({POLICY_UPDATED}){' '}
        {purpose}
      </label>
    </div>
  )
}
