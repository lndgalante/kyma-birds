// Shared contract between the plate (src/cymatics/**) and the app shell.
// Source of truth: docs/specs/engine.md §3.2. Changing a signature here is a cross-team change.
import type { PlateDriveSource } from '~/audio/engine/types'

export type PlateShape = 'circle' | 'square'
export type Tier = 'high' | 'medium' | 'low' | 'floor'
export type QualityPreference = 'auto' | 'high' | 'medium' | 'low'

export interface PlateBird {
  id: string
  bandHz: { p10: number; p50: number; p90: number }
  peakHz: number
  symmetry?: 3 | 4 | 5 | 6
}

export interface PlateTelemetry {
  modeKey: string | null // '(4,1)' circle (diameters,circles); '(2,4)' square (m,n), m ≤ n
  dominantHz: number | null // drive pitch while voiced
  gammaRms: number // plate RMS acceleration, g units
  tier: Tier
  grains: number
  fps: number
}

export type PlateErrorCode =
  'webgl-unavailable' | 'float-unsupported' | 'context-lost' | 'init-failed'
export interface PlateError {
  code: PlateErrorCode
  recoverable: boolean
  message: string
}
export interface PlateReadyInfo {
  tier: Tier
  grains: number
  renderer: 'webgl2'
}

export interface CymaticsPlateProps {
  source: PlateDriveSource // engine.driveSource
  bird: PlateBird | null // committed bird (calibration input)
  plateShape: PlateShape
  paused: boolean // true unless audio state is 'playing' → drive forced to 0, sand rests
  held?: boolean // visual freeze (WCAG 2.2.2); audio and telemetry continue
  scatterToken?: number // each increment re-scatters the sand
  reducedMotion?: boolean // undefined → follow matchMedia('(prefers-reduced-motion: reduce)')
  accentColor?: string // CSS colour; used ONLY by the debug field view (sand never takes the accent)
  quality?: QualityPreference // default 'auto'
  debug?: boolean // field heat overlay + window.__kymaPlate stats
  className?: string
  onReady?(info: PlateReadyInfo): void
  onError?(error: PlateError): void
  onTelemetry?(t: PlateTelemetry): void // ≤ 8 Hz
}
