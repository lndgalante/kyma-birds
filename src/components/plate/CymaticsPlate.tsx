import { createClientOnlyFn } from '@tanstack/react-start'
import { lazy } from 'react'

// On the server the Start compiler swaps this for a throwing stub, so three.js never reaches the
// worker bundle; <ClientOnly> guarantees it is only called in the browser (engine.md §9.2).
export const LazyCymaticsPlate = lazy(createClientOnlyFn(() => import('~/cymatics/CymaticsPlate')))
