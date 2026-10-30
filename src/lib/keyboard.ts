import { useEffect, useRef } from 'react'

/**
 * Targets that own every key the instrument maps (ui.md §8.3): text entry, ranges, radios, the
 * rail's tabs and dialogs. The global shortcuts never steal from them.
 */
export const WIDGET_SELECTOR =
  'input, textarea, select, [role=tab], [role=slider], [role=radio], [contenteditable], [contenteditable=""], [role=dialog]'

/**
 * Targets with a native Space action (activation, or the link's page scroll). Arrows, Home, End
 * and letter shortcuts mean nothing to them, so those shortcuts work while a button or link has focus
 * (Chrome and Firefox focus a button on mouse click).
 */
export const ACTIVATABLE_SELECTOR = 'button, a, summary'

interface KeyTarget {
  closest?: (selector: string) => unknown
  isContentEditable?: boolean
}

function matches(target: unknown, selector: string): boolean {
  if (!target || typeof target !== 'object') return false
  const t = target as KeyTarget
  return typeof t.closest === 'function' && t.closest(selector) != null
}

export function isTypingOrWidgetTarget(target: unknown): boolean {
  return !!(target as KeyTarget | null)?.isContentEditable || matches(target, WIDGET_SELECTOR)
}

/**
 * Whether a modal is open (the Sheet, on Radix Dialog); an open one owns the keyboard. A closed
 * one stays in the DOM while it animates out, so its state counts, not its role.
 */
export function isDialogOpen(doc: Pick<Document, 'querySelector'>): boolean {
  return doc.querySelector('[role=dialog][data-state=open]') != null
}

export type ShortcutAction =
  'prev' | 'next' | 'first' | 'last' | 'toggle' | 'mute' | 'hold' | 'photo' | 'scatter'

interface KeyLike {
  key: string
  code?: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey?: boolean
  target: unknown
}

/** Pure key → action mapping, so it can be tested without a DOM. */
export function shortcutFor(e: KeyLike): ShortcutAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null
  if (isTypingOrWidgetTarget(e.target)) return null
  switch (e.key) {
    case 'ArrowLeft':
      return 'prev'
    case 'ArrowRight':
      return 'next'
    case 'Home':
      return 'first'
    case 'End':
      return 'last'
    case ' ':
    case 'Spacebar':
      return matches(e.target, ACTIVATABLE_SELECTOR) ? null : 'toggle'
    case 'm':
    case 'M':
      return e.shiftKey ? null : 'mute'
    default:
      return null
  }
}

export function plateShortcutFor(e: KeyLike): ShortcutAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return null
  if (isTypingOrWidgetTarget(e.target)) return null
  switch (e.key.toLowerCase()) {
    case 'h':
      return 'hold'
    case 'p':
      return 'photo'
    case 's':
      return 'scatter'
    default:
      return null
  }
}

/**
 * Actions run inside the key event, so Space can unlock audio and P can open a save dialog.
 */
export function useGlobalShortcuts(
  handler: (action: ShortcutAction, e: KeyboardEvent) => void,
  enabled = true,
  resolve: (e: KeyLike) => ShortcutAction | null = shortcutFor,
): void {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (isDialogOpen(document)) return
      const action = resolve(e)
      if (!action) return
      // Prevent first: a held Space must not scroll the page either.
      e.preventDefault()
      // Navigation may repeat; playback, captures and plate changes must fire only once.
      if (e.repeat && !['prev', 'next', 'first', 'last'].includes(action)) return
      ref.current(action, e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, resolve])
}
