import { createContext, useContext } from 'react'

/**
 * Where Radix portals (Dialog, Tooltip) mount: the page's `.app` element (AppShell), so portalled
 * content inherits the bird's palette, which theme.ts sets inline on `.app`. Null (before the
 * shell mounts) lets Radix fall back to document.body.
 */
const PortalContainerContext = createContext<HTMLElement | null>(null)

export const PortalContainerProvider = PortalContainerContext.Provider

export function usePortalContainer() {
  return useContext(PortalContainerContext)
}
