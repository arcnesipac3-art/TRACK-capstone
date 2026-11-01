import { forwardRef } from 'react'
import { Link } from 'react-router-dom'

/**
 * React Router link styled as a button.
 *
 * A navigation control cannot be a <button>, so every "View", "Continue draft"
 * and "Start an application" in the app hand-wrote `className="btn btn-x btn-y"`
 * on a <Link> — three class names per control and nothing to keep them in sync.
 * The list here matches Button's, so a link and a button in the same toolbar
 * render as the same control.
 *
 * Unlike Button, the children are not wrapped in `.btn-content`: that span
 * exists to seat a spinner beside a label, and `.btn` is already an inline-flex
 * carrying the size's gap.
 */
const ButtonLink = forwardRef(({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}, ref) => {
  const classes = [
    'btn',
    `btn-${variant}`,
    `btn-${size}`,
    className
  ].filter(Boolean).join(' ')

  return (
    <Link ref={ref} className={classes} {...props}>
      {children}
    </Link>
  )
})

ButtonLink.displayName = 'ButtonLink'

export default ButtonLink
