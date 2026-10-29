import { cva, type VariantProps } from 'class-variance-authority'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type * as React from 'react'
import { cn } from '~/lib/utils'
import { usePortalContainer } from './portal'

/**
 * shadcn/ui Dialog (Radix) with the Kyma surfaces and motion (ui.md §7.4). Two layouts:
 * `dialog` is always a centred 560px dialog; `sheet` is that dialog from 40rem up and a bottom
 * sheet below it (Details in Field), which slides without fading. Transforms run only under
 * motion-safe: with reduced motion the centred dialog fades in 150ms linear and the bottom sheet
 * just appears. Radix needs CSS *animations* (tw-animate-css) to delay unmount on close; while
 * they run, the closed overlay and dialog let the pointer through to the page (`!`, because Radix
 * sets pointer-events inline). `transition-none`: the durations are for the animations only.
 */

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

const dialogContentVariants = cva(
  'fixed z-50 flex flex-col overflow-hidden bg-ground-raised text-ink ring-1 ring-line transition-none data-[state=open]:animate-in data-[state=closed]:pointer-events-none! data-[state=closed]:animate-out motion-safe:data-[state=open]:duration-(--dur-3) motion-safe:data-[state=open]:ease-out motion-safe:data-[state=closed]:duration-200 motion-safe:data-[state=closed]:ease-in motion-reduce:duration-150 motion-reduce:ease-linear',
  {
    variants: {
      layout: {
        // Centred like a modal <dialog> in the UA stylesheet: auto margins on a fit-content box
        // (no half-pixel translate), and its max-width of 100% - 6px - 2em at the 15px body size.
        dialog:
          'inset-0 m-auto h-fit w-[min(560px,calc(100vw-32px))] max-w-[calc(100%-36px)] max-h-[min(86dvh,820px)] rounded-2xl shadow-dialog data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:zoom-in-98 motion-safe:data-[state=closed]:zoom-out-98',
        // `stacked:` repeats the centred dialog class by class, since Tailwind only generates
        // classes it finds written out in source; `field:` makes the bottom sheet.
        sheet:
          'stacked:inset-0 stacked:m-auto stacked:h-fit stacked:w-[min(560px,calc(100vw-32px))] stacked:max-h-[min(86dvh,820px)] stacked:rounded-2xl stacked:shadow-dialog stacked:data-[state=open]:fade-in-0 stacked:data-[state=closed]:fade-out-0 stacked:motion-safe:data-[state=open]:zoom-in-98 stacked:motion-safe:data-[state=closed]:zoom-out-98 field:inset-x-0 field:bottom-0 field:w-full field:max-h-[88dvh] field:rounded-t-2xl field:shadow-sheet field:motion-safe:data-[state=open]:slide-in-from-bottom field:motion-safe:data-[state=open]:ease-sheet field:motion-safe:data-[state=closed]:slide-out-to-bottom',
      },
    },
    defaultVariants: { layout: 'dialog' },
  },
)

function DialogContent({
  className,
  layout,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> &
  VariantProps<typeof dialogContentVariants>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(dialogContentVariants({ layout }), className)}
        {...props}
      />
    </DialogPortal>
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-4xl leading-[1.15] font-semibold tracking-title', className)}
      {...props}
    />
  )
}

function DialogPortal(props: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  const container = usePortalContainer()
  return <DialogPrimitive.Portal data-slot="dialog-portal" container={container} {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-backdrop transition-none duration-(--dur-3) ease-out data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:pointer-events-none! data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
        className,
      )}
      {...props}
    />
  )
}

export { Dialog, DialogClose, DialogContent, DialogTitle }
