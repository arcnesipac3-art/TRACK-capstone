import { forwardRef } from 'react'
import ButtonLoader from './loading/ButtonLoader'

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
  const classes = [
    'btn',
    `btn-${variant}`,
    `btn-${size}`,
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
