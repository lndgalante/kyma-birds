import { Tooltip as TooltipPrimitive } from 'radix-ui'
import type * as React from 'react'
import { cn } from '~/lib/utils'
import { usePortalContainer } from './portal'

/**
 * shadcn/ui Tooltip as a small raised part. One TooltipProvider sits in __root.tsx. Tooltips
 * never open on touch; they open on hover (after 500ms) and on keyboard focus, and only ever
 * repeat a visible label plus its shortcut. The first one fades and grows in; one that opens
 * at once, while the pointer moves between neighbours, just appears. A key cap at the end sits
 * 6px in from the top, bottom and end, so the 12px corners stay concentric with the cap's 6.
 */
function TooltipProvider({
  delayDuration = 500,
  skipDelayDuration = 300,
  disableHoverableContent = true,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
      disableHoverableContent={disableHoverableContent}
      {...props}
    />
  )
}

function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

/**
 * Radix opens on any focus that doesn't come during a press, and a tap focuses its button only
 * after pointerup; it also takes the mouse events a touch screen fakes after a tap for hover. A
 * prevented event skips Radix's handler, so only keyboard focus and a real hover open the tip.
 */
function TooltipTrigger({
  onFocus,
  onPointerMove,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      onFocus={(e) => {
        if (!e.currentTarget.matches(':focus-visible')) e.preventDefault()
        onFocus?.(e)
      }}
      onPointerMove={(e) => {
        if (!matchMedia('(any-hover: hover)').matches) e.preventDefault()
        onPointerMove?.(e)
      }}
      {...props}
    />
  )
}

function TooltipContent({
  className,
  sideOffset = 4,
  collisionPadding = 8,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  const container = usePortalContainer()
  return (
    <TooltipPrimitive.Portal container={container}>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          'pointer-events-none z-(--z-tooltip) inline-flex w-fit max-w-[28ch] origin-(--radix-tooltip-content-transform-origin) items-center gap-2 rounded-bed bg-ground-raised px-2.5 py-1.5 text-sm leading-[1.2] font-medium text-balance text-ink shadow-part transition-none duration-(--dur-1) ease-out has-[kbd]:pe-1.5 animate-in fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=instant-open]:animate-none motion-safe:zoom-in-95 motion-safe:data-[state=closed]:zoom-out-95 forced-colors:border forced-colors:border-[CanvasText]',
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-ground-raised fill-ground-raised" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
