import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '~/components/ui/dialog'
import { COPY } from '~/lib/copy'
import { cn } from '~/lib/utils'
import { IconButton } from './IconButton'

interface SheetProps {
  open: boolean
  onClose(): void
  /** 'sheet' is a bottom sheet in Field and a centred dialog elsewhere; 'dialog' is always centred. */
  variant?: 'sheet' | 'dialog'
  children: ReactNode
}

/**
 * A modal on shadcn/ui's Dialog (Radix): focus trap, Esc, outside press, scroll lock and
 * aria-hidden on the page come from Radix; we set aria-modal, as Radix leaves it off. Focus goes
 * back to whatever had it when the sheet opened (Radix would only return it to a <DialogTrigger>,
 * and ours are plain buttons).
 * Put a <SheetTitle> inside: Radix labels the dialog with it.
 */
export function Sheet({ open, onClose, variant = 'dialog', children }: SheetProps) {
  const content = useRef<HTMLDivElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)
  const openedAt = useRef(0)
  // Layout effects run before Radix's focus scope moves focus into the dialog.
  useLayoutEffect(() => {
    if (!open) return
    openedAt.current = performance.now()
    const active = document.activeElement as HTMLElement | null
    if (!returnTo.current) {
      returnTo.current = active
      return
    }
    // Reopened during its exit animation: Radix keeps that focus scope and won't move focus in.
    if (!content.current?.contains(active)) {
      tabbables(content.current)[0]?.focus()
      if (active !== document.body) returnTo.current = active
    }
  }, [open])
  // Hand focus back as the sheet closes, as a native modal does: Radix waits for the exit
  // animation, and until then the global shortcuts see a dialog target and ignore keys. A passive
  // effect, so Radix's focus trap has already let go. A click in Safari focuses nothing, so a
  // sheet opened that way lets focus drop to the body, as dialog.close() does.
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null
    if (open || !content.current?.contains(active)) return
    const el = returnTo.current
    if (el?.isConnected && el !== document.body) el.focus({ preventScroll: true })
    else active?.blur()
  }, [open])
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        ref={content}
        layout={variant}
        aria-modal="true"
        aria-describedby={undefined}
        className={`sheet sheet--${variant}`}
        // Radix dismisses on the click that ends a press outside, even while the sheet fades out,
        // so the click that reopened it would close it again.
        onPointerDownOutside={(e) => {
          if (e.detail.originalEvent.timeStamp < openedAt.current) e.preventDefault()
        }}
        // Radix focuses without scrolling (on open, and when Tab wraps), which can leave the
        // focused control out of view in a scrolled sheet. The body's scroll margin keeps its
        // focus ring in view too.
        onFocus={(e) => e.target.scrollIntoView({ block: 'nearest' })}
        onKeyDown={wrapOptionTab}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          const el = returnTo.current
          returnTo.current = null
          // Focus went back on close; a press outside can since have dropped it on the body.
          if (el?.isConnected && document.activeElement === document.body) {
            el.focus({ preventScroll: true })
          }
        }}
      >
        <div className="sheet__body flex min-h-0 flex-col overflow-y-auto overscroll-contain px-5 pt-6 pb-[calc(24px+var(--safe-b))] stacked:px-8 stacked:pt-7 stacked:pb-[calc(32px+var(--safe-b))] [&_:focus-visible]:scroll-my-4">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * A section heading inside a sheet. Add no weight class to it in cn(): tailwind-merge reads
 * `font-display` as a weight and would drop it.
 */
export const SHEET_HEADING = 'mt-8 mb-3 font-display text-lg leading-[1.2] tracking-title text-ink'

export function SheetTitle({ className, ...props }: ComponentProps<typeof DialogTitle>) {
  return <DialogTitle className={cn('sheet__title', className)} {...props} />
}

/**
 * The header's X, pulled up and out so its glyph lines up with the title's cap height and the
 * text's end edge; `className` can place it elsewhere, as over Details' photo. No tooltip: Radix
 * focuses it when the sheet opens, and a tooltip would pop up on every open.
 */
export function SheetCloseButton({ className }: { className?: string }) {
  return (
    <DialogClose asChild>
      <IconButton label={COPY.close} icon="close" className={cn('-mt-1.5 -me-2.5', className)} />
    </DialogClose>
  )
}

export { DialogClose as SheetClose }

/**
 * Radix's focus trap wraps Tab but not Option+Tab, Safari's key for reaching links; at either end
 * of the sheet the browser would leave the page and Radix would pull focus back to the same control.
 */
function wrapOptionTab(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== 'Tab' || !e.altKey || e.ctrlKey || e.metaKey) return
  const items = tabbables(e.currentTarget)
  const [from, to] = e.shiftKey ? [items[0], items.at(-1)] : [items.at(-1), items[0]]
  if (to && document.activeElement === from) {
    e.preventDefault()
    to.focus()
  }
}

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

function tabbables(container: HTMLElement | null): HTMLElement[] {
  if (!container) return []
  return [...container.querySelectorAll<HTMLElement>(TABBABLE)].filter(
    (el) => el.getClientRects().length > 0,
  )
}
