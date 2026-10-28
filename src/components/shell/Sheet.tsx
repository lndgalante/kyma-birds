import { useEffect, useRef, type ReactNode } from 'react'

interface SheetProps {
  open: boolean
  onClose(): void
  labelledBy: string
  /** 'sheet' is a bottom sheet in Field and a centred dialog elsewhere; 'dialog' is always centred. */
  variant?: 'sheet' | 'dialog'
  className?: string
  children: ReactNode
}

/** A native modal `<dialog>`: focus trap, Esc and the top layer come from the platform. */
export function Sheet({
  open,
  onClose,
  labelledBy,
  variant = 'dialog',
  className,
  children,
}: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      returnTo.current = document.activeElement as HTMLElement | null
      d.showModal()
    } else if (!open && d.open) {
      d.close()
    }
  }, [open])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    const onNativeClose = () => {
      const el = returnTo.current
      returnTo.current = null
      if (el?.isConnected) el.focus({ preventScroll: true })
      onCloseRef.current()
    }
    d.addEventListener('close', onNativeClose)
    return () => d.removeEventListener('close', onNativeClose)
  }, [])

  return (
    <dialog
      ref={ref}
      className={`sheet sheet--${variant}${className ? ` ${className}` : ''}`}
      aria-labelledby={labelledBy}
      // A press that starts and ends on the backdrop (the dialog box itself) closes it.
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close()
      }}
    >
      <div className="sheet__body">{children}</div>
    </dialog>
  )
}
