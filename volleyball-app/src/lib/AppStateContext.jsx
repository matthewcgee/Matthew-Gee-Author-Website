import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { loadState, saveState } from './storage.js'

const AppStateContext = createContext(null)

export function AppStateProvider({ children }) {
  const [state, setState] = useState(loadState)

  useEffect(() => {
    saveState(state)
  }, [state])

  // Accepts either a new state object or an updater(state) => state,
  // matching the storage.js helpers which all take (state, ...) => newState.
  const update = useCallback((updater) => {
    setState((prev) => (typeof updater === 'function' ? updater(prev) : updater))
  }, [])

  return <AppStateContext.Provider value={{ state, update }}>{children}</AppStateContext.Provider>
}

export function useAppState() {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider')
  return ctx
}
