/** Consistent page heading with optional action buttons. */
export default function PageHeader({ title, subtitle, actions, children, className = '' }) {
  return (
    <header className={`page-header${className ? ` ${className}` : ''}`}>
      <div className="grow stack stack-xs">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="row row-wrap">{actions}</div>}
    </header>
  )
}
