import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/** clsx, then tailwind-merge taught the Kyma theme. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * The theme's colour names (app.css `@theme inline`); keep in step with it. tailwind-merge's
 * default colour scale accepts any word, so a hook class such as `text-link` would be read as a
 * text colour and dropped next to `text-ink-2`.
 */
const COLOURS = [
  'inherit',
  'current',
  'transparent',
  'white',
  'black',
  'ink',
  'ink-2',
  'ink-3',
  'ink-4',
  'line',
  'line-2',
  'ground',
  'ground-raised',
  'ground-sunken',
  'scrim',
  'signal',
  'on-signal',
  'plate-surface',
  'plate-rim',
  'plate-sand',
  'on-status',
  'iucn-lc',
  'iucn-nt',
  'iucn-vu',
  'iucn-en',
  'iucn-cr',
  'iucn-ew',
  'iucn-ex',
  'iucn-dd',
  'focus',
  'focus-halo',
  'backdrop',
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'border',
  'input',
  'ring',
]

/**
 * tailwind-merge, taught the Kyma theme scales (app.css @theme): without them, it reads
 * `text-2xs` as a colour and drops it next to `text-ink-2`, and keeps both `font-ui` and
 * `font-medium`. Kyma's text sizes set no line-height, so a later `text-*` must not drop an
 * earlier `leading-*`.
 */
const twMerge = extendTailwindMerge({
  override: { theme: { color: COLOURS }, conflictingClassGroups: { 'font-size': [] } },
  extend: {
    theme: {
      text: ['2xs', 'xs', 'sm', 'md', 'base', 'lg', 'xl', '2xl', '3xl', '4xl'],
      'font-weight': ['book', 'ui', 'display', 'sci', 'mark'],
      tracking: ['display', 'title', 'ui', 'lang', 'chip', 'label', 'sci', 'code', 'mark'],
      shadow: ['plate', 'sheet', 'dialog'],
      ease: ['sheet'],
      animate: ['flow-dash', 'gate-pulse', 'gate-pulse-2', 'gate-pulse-3'],
    },
  },
})
