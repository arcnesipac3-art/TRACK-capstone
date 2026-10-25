/**
 * The provider component for shared authentication state.
 * The context it supplies, and the useAuth hook, live in AuthContext.jsx.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import api, { ApiError } from '../services/api'
import AuthContext from './AuthContext'

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
    // Abort the session check after 10 seconds so the app never freezes
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)
    try {
      const me = await api.get('/auth/me/', { signal: controller.signal })
      clearTimeout(timeoutId)
      setUser(normalizeUser(me))
      setStatus('authenticated')
      setBootstrapError(null)
      return normalizeUser(me)
    } catch (err) {
      clearTimeout(timeoutId)
      if (err.name === 'AbortError') {
        // Timed out — treat as anonymous so the app doesn't stay stuck
        setUser(null)
        setStatus('anonymous')
        setBootstrapError('Session check timed out. Please sign in.')
        return null
      }
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setUser(null)
        setStatus('anonymous')
        setBootstrapError(null)
      } else if (opts.silent !== true) {
        setStatus((prev) => (prev === 'loading' ? 'anonymous' : prev))
        setBootstrapError(err.message)
      }
      return null
    }
  }, [])

  // Restoring the session on first mount is a genuine external-system sync;
  // loadSession writes state only after its requests resolve. queueMicrotask
  // runs the kickoff outside the effect's synchronous pass.
  useEffect(() => {
    queueMicrotask(loadSession)
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

