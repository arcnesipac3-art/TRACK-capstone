import { createContext, useContext } from 'react'

/**
 * Confirmation for destructive or consequential writes.
 *
 * Screens ask for it with
 *
 *   const confirm = useConfirm()
 *   if (!(await confirm({ title: 'Delete section', message: '…' }))) return
 *
 * which reads like the `window.confirm` call it replaces, so the guard stays
 * in front of the write and a declined dialog still means "run nothing".
 * Unlike the native one it is styled, labelled, trap-focused, and names the
 * consequence instead of prefixing the question with a browser origin.
 *
 * The <ConfirmProvider> component lives in ConfirmProvider.jsx. This module has
 * no JSX, so it stays a .js file and the react/only-export-components Fast
 * Refresh rule never applies to it — the same split AuthContext.js uses.
 */

const ConfirmContext = createContext(null)

/** Returns `confirm(request) -> Promise<boolean>`. */
export function useConfirm() {
  const confirm = useContext(ConfirmContext)
  if (!confirm) throw new Error('useConfirm must be used inside <ConfirmProvider>')
  return confirm
}

export default ConfirmContext
