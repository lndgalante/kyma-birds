import { useState, type CSSProperties, type ReactNode } from 'react'
import { PortalContainerProvider } from '~/components/ui/portal'
import { cn } from '~/lib/utils'

/**
 * The page root (`.app`): the bird's palette inline (lib/theme.ts), the room's drift from one
 * bird to the next (--dur-room on --ease-breath, a sine) through the registered colour
 * properties, which turn toward a new bird mid-drift, and the mount point for Radix portals. The
 * drift is a fade, not motion, so `keep-motion` keeps it under reduced motion, where --dur-room
 * shortens.
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
        'app keep-motion min-h-dvh bg-ground text-ink transition-[--signal,--ground,--ground-raised,--ground-sunken,--scrim] duration-(--dur-room) ease-breath',
        className,
      )}
      style={theme}
    >
      <PortalContainerProvider value={el}>{children}</PortalContainerProvider>
    </div>
  )
}
