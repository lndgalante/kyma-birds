import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react'

type Announce = (message: string) => void

const AnnounceContext = createContext<Announce>(() => {})

/**
 * The one polite live region (ui.md §8.4). It is rendered empty on the server; messages are
 * written straight to the DOM so announcing never re-renders the app.
 */
export function SrStatusProvider({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const raf = useRef(0)
  const announce = useCallback<Announce>((message) => {
    const el = ref.current
    if (!el) return
    cancelAnimationFrame(raf.current)
    // Clearing first lets the same sentence be announced twice in a row.
    el.textContent = ''
    raf.current = requestAnimationFrame(() => {
      raf.current = requestAnimationFrame(() => {
        el.textContent = message
      })
    })
  }, [])
  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <p id="sr-status" ref={ref} className="sr-only" role="status" aria-live="polite" />
    </AnnounceContext.Provider>
  )
}

export function useAnnounce(): Announce {
  return useContext(AnnounceContext)
}
