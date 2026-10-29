import { useState, type CSSProperties, type ReactNode } from 'react'
import { PortalContainerProvider } from '~/components/ui/portal'
import { cn } from '~/lib/utils'

/**
 * The page root (`.app`): the bird's palette inline (lib/theme.ts), the cross-fade between
 * birds through the registered colour properties, and the mount point for Radix portals. A fade
 * is not motion, so `keep-motion` keeps it under reduced motion, where --dur-4 shortens.
 */
export function AppShell({
  theme,
  className,
  children,
}: {
  theme?: CSSProperties
  className?: string
  children: ReactNode
}) {
  // State, not a ref, so the portals render again into the element once it mounts.
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  return (
    <div
      ref={setEl}
      className={cn(
        'app keep-motion min-h-dvh bg-ground text-ink transition-[--signal,--ground,--ground-raised,--ground-sunken,--scrim] duration-(--dur-4) ease-in-out',
        className,
      )}
      style={theme}
    >
      <PortalContainerProvider value={el}>{children}</PortalContainerProvider>
    </div>
  )
}
