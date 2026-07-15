"use client"

import * as React from "react"

/**
 * Returns false during SSR and the first client render, then true once mounted.
 * Implemented with useSyncExternalStore so it does NOT call setState inside an
 * effect (satisfies react-hooks/set-state-in-effect). Use to gate client-only
 * rendering and avoid hydration mismatches.
 */
export function useMounted(): boolean {
  return React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
}
