import type { ComponentProps } from 'react'
import { cn } from '~/lib/utils'

/** Off-screen until focused. */
export function SkipLink({ className, ...props }: ComponentProps<'a'>) {
  return (
    <a
      className={cn(
        'skip-link fixed top-[calc(8px+var(--safe-t))] left-[calc(8px+var(--safe-l))] z-(--z-toast) inline-flex min-h-11 -translate-y-[calc(100%+16px)] items-center rounded-full bg-ink px-5 text-md leading-none font-medium whitespace-nowrap text-ground no-underline transition-[translate] duration-(--dur-2) ease-out focus:translate-y-0',
        className,
      )}
      {...props}
    />
  )
}
