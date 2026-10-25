import { createContext, useContext } from 'react'

/**
 * Shared authentication state.
 *
 * The session itself lives in an HttpOnly-ish Django session cookie — this
 * context only caches the *profile* returned by `/api/auth/me/`. No password
 * or token is ever written to browser storage.
 */

const AuthContext = createContext(null)

// The hook stays beside the context it reads; the <AuthProvider> component
// lives in AuthProvider.jsx, so this module exports no components and keeps
// an exact Fast Refresh boundary (react/only-export-components needs no
// suppression here).
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export default AuthContext
