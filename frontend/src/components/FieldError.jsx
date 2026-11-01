import Icon from './Icon'

/**
 * The message under an invalid field. Renders nothing when the field is
 * clean, so call sites stay `{error && <FieldError id={x} message={error} />}`.
 *
 * `id` must match the input's `aria-describedby` — that is what makes a screen
 * reader announce the error when the field receives focus.
 */
export default function FieldError({ id, message }) {
  if (!message) return null
  return (
    <span className="field-error" id={id}>
      <Icon name="info" size={13} />
      {message}
    </span>
  )
}
