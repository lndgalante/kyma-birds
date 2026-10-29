import { cva } from 'class-variance-authority'

/** Kyma's text links; the `flex` layout sets an icon beside its text. */
export const textLinkVariants = cva(
  'text-ink-2 underline decoration-ink-4 decoration-1 underline-offset-[0.18em] transition-colors hover:text-ink hover:decoration-signal',
  {
    variants: {
      layout: {
        inline: '',
        flex: 'inline-flex items-center gap-1.5',
      },
    },
    defaultVariants: { layout: 'inline' },
  },
)
