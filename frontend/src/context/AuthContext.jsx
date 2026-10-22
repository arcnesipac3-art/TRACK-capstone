import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import api, { ApiError } from '../services/api'

/**
 * Shared authentication state.
 *
 * The session itself lives in an HttpOnly-ish Django session cookie — this
 * context only caches the *profile* returned by `/api/auth/me/`. No password
 * or token is ever written to browser storage.
 */

const AuthContext = createContext(null)

const VALID_ROLES = ['admin', 'teacher', 'student', 'parent']

/** Maps whatever the backend returns onto the four TRACK roles. */
function normalizeRole(role) {
  const value = String(role || '').toLowerCase()
  if (VALID_ROLES.includes(value)) return value
  if (value === 'administrator' || value === 'superadmin') return 'admin'
  if (value === 'learner') return 'student'
  return null
}

function normalizeUser(raw) {
  if (!raw) return null
  const role = normalizeRole(raw.role)
  // Backend-provided RBAC data (see core/rbac.py). Only administrators have
  // departments or permission keys; everything here is read-only.
  const permissions = Array.isArray(raw.permissions) ? raw.permissions : []
  const departments = Array.isArray(raw.departments) ? raw.departments : []
  return {
    id: raw.id,
    username: raw.username,
    email: raw.email || '',
    firstName: raw.first_name || '',
    middleName: raw.middle_name || '',
    lastName: raw.last_name || '',
    fullName:
      raw.full_name ||
      [raw.first_name, raw.middle_name, raw.last_name]
        .filter(Boolean)
        .join(' ') ||
      raw.username,
    role,
    isActive: raw.is_active !== false,
    isSuperAdmin: raw.is_super_admin === true && role === 'admin',
    departments: role === 'admin' ? departments : [],
    permissions: role === 'admin' ? permissions : [],
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // 'loading' | 'authenticated' | 'anonymous'
  const [status, setStatus] = useState('loading')
  const [bootstrapError, setBootstrapError] = useState(null)

  const loadSession = useCallback(async (opts = {}) => {
    try {
      const me = await api.me()
      setUser(normalizeUser(me))
      setStatus('authenticated')
      setBootstrapError(null)
      return normalizeUser(me)
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setUser(null)
        setStatus('anonymous')
        setBootstrapError(null)
      } else if (opts.silent !== true) {
        // Network/server problem — do not pretend the user is signed out
        setStatus((prev) => (prev === 'loading' ? 'anonymous' : prev))
        setBootstrapError(err.message)
      }
      return null
    }
  }, [])

  // Restoring the session on first mount is a genuine external-system sync.
  // loadSession only sets state after its awaited requests resolve, so nothing
  // is written synchronously during this render pass.
  useEffect(() => {
    /* oxlint-disable-next-line react/set-state-in-effect */
    loadSession()
  }, [loadSession])

  const login = useCallback(
    async (username, password) => {
      const data = await api.login(username, password)
      const profile = normalizeUser(data.user)
      setUser(profile)
      setStatus('authenticated')
      setBootstrapError(null)
      return profile
    },
    []
  )

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } catch {
      /* even if the call fails, drop local state */
    }
    setUser(null)
    setStatus('anonymous')
  }, [])

  const can = useCallback(
    /**
     * True when the signed-in administrator holds a permission key.
     * Django enforces this again on every request — this only decides what
     * the interface offers. Everyone who is not an administrator has none.
     */
    (permission) =>
      !!user && user.role === 'admin' && user.permissions.includes(permission),
    [user]
  )

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated' && !!user,
      isLoading: status === 'loading',
      bootstrapError,
      can,
      login,
      logout,
      refreshUser: loadSession,
    }),
    [user, status, bootstrapError, can, login, logout, loadSession]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// The hook belongs next to the context it reads; splitting it out would mean
// a second import path for every consumer. Fast-refresh still recovers.
/* oxlint-disable-next-line react/only-export-components */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export default AuthContext
