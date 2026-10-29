import { cva } from 'class-variance-authority'

/** Kyma's links: ink-2, with a dotted underline that turns solid on hover. */
export const textLinkVariants = cva(
  'text-ink-2 underline decoration-current/70 decoration-dotted decoration-from-font underline-offset-3 transition-colors hover:text-ink hover:decoration-solid',
  {
    variants: {
      layout: {
        inline: '',
        // an icon and its text
        flex: 'inline-flex items-center gap-1.5',
      },
    },
    defaultVariants: { layout: 'inline' },
  },
)
