import { describe, expect, it } from 'vitest'
import {
  ACTIVATABLE_SELECTOR,
  WIDGET_SELECTOR,
  isTypingOrWidgetTarget,
  shortcutFor,
} from '~/lib/keyboard'

// A stand-in for an element: `closest` answers whether the target is (inside) a widget or a
// button/link.
const el = (kind: 'plain' | 'widget' | 'button' = 'plain') => ({
  closest: (sel: string) =>
    (sel === WIDGET_SELECTOR && kind === 'widget') ||
    (sel === ACTIVATABLE_SELECTOR && kind === 'button')
      ? {}
      : null,
})
const key = (k: string, extra: Partial<Parameters<typeof shortcutFor>[0]> = {}) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  target: el(),
  ...extra,
})

describe('keyboard', () => {
  it('maps the instrument keys on non-interactive targets', () => {
    expect(shortcutFor(key('ArrowLeft'))).toBe('prev')
    expect(shortcutFor(key('ArrowRight'))).toBe('next')
    expect(shortcutFor(key('Home'))).toBe('first')
    expect(shortcutFor(key('End'))).toBe('last')
    expect(shortcutFor(key(' '))).toBe('toggle')
    expect(shortcutFor(key('m'))).toBe('mute')
    expect(shortcutFor(key('M'))).toBe('mute')
    expect(shortcutFor(key('x'))).toBeNull()
  })

  it('never steals keys from widgets or modified presses', () => {
    for (const k of ['ArrowLeft', 'ArrowRight', 'Home', 'End', ' ', 'm']) {
      expect(shortcutFor(key(k, { target: el('widget') }))).toBeNull()
    }
    expect(shortcutFor(key('ArrowLeft', { metaKey: true }))).toBeNull()
    expect(shortcutFor(key('m', { ctrlKey: true }))).toBeNull()
    expect(shortcutFor(key('End', { altKey: true }))).toBeNull()
  })

  it('leaves Space to buttons and links but keeps the keys they have no use for', () => {
    const target = el('button')
    expect(shortcutFor(key(' ', { target }))).toBeNull()
    expect(shortcutFor(key('Spacebar', { target }))).toBeNull()
    expect(shortcutFor(key('ArrowRight', { target }))).toBe('next')
    expect(shortcutFor(key('ArrowLeft', { target }))).toBe('prev')
    expect(shortcutFor(key('Home', { target }))).toBe('first')
    expect(shortcutFor(key('End', { target }))).toBe('last')
    expect(shortcutFor(key('m', { target }))).toBe('mute')
  })

  it('treats editable and widget targets as owning their keys', () => {
    expect(isTypingOrWidgetTarget({ isContentEditable: true })).toBe(true)
    expect(isTypingOrWidgetTarget(el('widget'))).toBe(true)
    expect(isTypingOrWidgetTarget(el('button'))).toBe(false)
    expect(isTypingOrWidgetTarget(el())).toBe(false)
    expect(isTypingOrWidgetTarget(null)).toBe(false)
    for (const s of ['input', 'select', '[role=tab]', '[role=slider]', '[role=radio]', 'dialog']) {
      expect(WIDGET_SELECTOR).toContain(s)
    }
    expect(WIDGET_SELECTOR).not.toMatch(/\bbutton\b/)
    for (const s of ['button', 'a', 'summary']) expect(ACTIVATABLE_SELECTOR).toContain(s)
  })
})
