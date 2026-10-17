import { Component } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'

/**
 * Catches render-time crashes so a broken screen shows a readable message
 * instead of a blank white page. React only supports error boundaries as
 * class components.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Surface the real stack in devtools; never swallow it silently.
    console.error('TRACK screen crashed:', error, info?.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReset = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="page-error" role="alert">
        <div className="page-error-card">
          <span className="page-error-mark" aria-hidden="true">
            <Icon name="info" size={26} />
          </span>
          <h1>This screen ran into a problem</h1>
          <p>
            Something on this page failed to load. Your account and data are
            safe — reloading usually fixes it.
          </p>
          <pre className="page-error-detail">{String(error?.message || error)}</pre>
          <div className="page-error-actions">
            <button type="button" className="btn btn-primary" onClick={this.handleReload}>
              <Icon name="refresh" size={15} />
              Reload the page
            </button>
            <button type="button" className="btn btn-secondary" onClick={this.handleReset}>
              Try again
            </button>
            <Link to="/" className="btn btn-ghost">
              Go to home
            </Link>
          </div>
        </div>
      </div>
    )
  }
}
