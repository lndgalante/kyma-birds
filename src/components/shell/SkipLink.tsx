import type { ReactNode } from 'react'

/** Off-screen until focused. */
export function SkipLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="skip-link fixed top-[calc(8px+var(--safe-t))] left-[calc(8px+var(--safe-l))] z-(--z-toast) inline-flex min-h-11 -translate-y-[calc(100%+16px)] items-center rounded-full bg-ink px-5 text-md leading-none font-medium whitespace-nowrap text-ground no-underline shadow-part transition-[translate] duration-(--dur-2) ease-out focus:translate-y-0"
    >
      {children}
    </a>
  )
}
