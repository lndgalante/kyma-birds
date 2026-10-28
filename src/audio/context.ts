import { createContext } from 'react'
import type { AudioApi } from './AudioProvider'

// In its own module so that a dev edit to AudioProvider.tsx re-creates the provider, not the
// context object its consumers already hold.
export const AudioApiContext = createContext<AudioApi | null>(null)
