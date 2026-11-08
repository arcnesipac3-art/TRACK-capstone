import { forwardRef, Children } from 'react'
import ButtonLoader from './loading/ButtonLoader'
import Icon from './Icon'

/**
 * Reusable button component with variants and sizes.
 *
 * `loading` disables the control (so a second click cannot fire the request
 * again), marks it `aria-busy`, and shows a spinner *beside* the label — the
 * label stays readable, and is replaced by `loadingLabel` when the action has
 * a more specific name ("Saving…", "Recording payment…").
 */
const Button = forwardRef(({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  loadingLabel = null,
  className = '',
  type = 'button',
  onClick,
  ...props
}, ref) => {
  // A control whose only content is an icon has no words to carry its
  // affordance, so a chromeless variant leaves it painted as nothing at all —
  // `btn-symbol` is how the stylesheet knows to give those a box.
  const only = Children.toArray(children)
  const symbol = only.length === 1 && only[0].type === Icon

  const classes = [
    'btn',
    `btn-${variant}`,
    `btn-${size}`,
    symbol && 'btn-symbol',
    disabled && 'btn-disabled',
    loading && 'btn-loading',
    className
  ].filter(Boolean).join(' ')

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={onClick}
      {...props}
    >
      {loading && <ButtonLoader />}
      <span className="btn-content">
        {loading && loadingLabel ? loadingLabel : children}
      </span>
    </button>
  )
})

Button.displayName = 'Button'

export default Button
