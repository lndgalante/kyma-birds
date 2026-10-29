// The copy deck (ui.md §10), verbatim. Stored in natural case; UPPERCASE comes from CSS.

export const COPY = {
  skip: 'Skip to the birds',
  navAbout: 'About',
  navCredits: 'Credits',
  navHomeAria: 'Kyma Birds, home',
  hintKeys: 'Space to play · ← → to change bird',
  zoneBird: 'Bird',
  zoneSong: 'Song',
  zonePlate: 'Plate',

  carouselLabel: 'Birds',
  pagerPrev: 'Previous bird',
  pagerNext: 'Next bird',
  railLabel: 'Choose a bird',
  railDesc: 'Birds are ordered from lowest to highest voice.',
  railLow: 'Low',
  railHigh: 'High',
  statusPrefix: 'IUCN status:',
  factsBand: 'Band',
  factsPeak: 'Peak',
  factsLoop: 'Loop',
  detailsButton: 'Details',
  detailsTraits: 'Traits',
  detailsSong: 'Song',
  detailsWhere: 'Where it lives',
  detailsCredits: 'Credits',
  close: 'Close',

  gateButton: 'Listen',
  gateSub: 'Sound on. Each song plays on a loop.',
  gateLoading: 'Loading…',
  playAria: 'Play song',
  pauseAria: 'Pause song',
  stateReady: 'Ready',
  stateLoading: 'Loading',
  statePlaying: 'Playing',
  statePaused: 'Paused',
  stateMuted: 'Muted',
  stateError: "Can't play",
  errorInline: "This song didn't load.",
  errorRetry: 'Try again',
  muteAria: 'Mute',
  volumeAria: 'Volume',
  readoutEmptySr: 'No sound yet',
  readoutLabelSr: 'Strongest frequency',
  noscriptAudio: 'Play the song',

  plateDesc:
    'Sand collects on the lines of the plate that stay still. As the song rises and falls, the pattern shifts between modes. Use Describe pattern to hear the current mode.',
  plateCaptionIdle: 'Waiting for sound',
  plateCaptionError: 'No sound',
  hold: 'Hold',
  scatter: 'Scatter sand',
  describe: 'Describe pattern',
  plateFallbackWebgl: "This browser can't draw the plate. The song still plays.",
  plateFallbackNojs: 'The plate needs JavaScript. You can still listen to the song.',

  aboutTitle: 'About Kyma Birds',
  aboutKyma: "Kyma (κῦμα) is Greek for wave. It's the root of the word cymatics.",
  aboutSeeingHeading: "What you're seeing",
  aboutCymatics:
    'Cymatics is the study of sound made visible. A thin plate vibrating at one of its resonant frequencies divides into areas that move and lines that stay still, called nodal lines; sand bounces off the moving areas and settles on the still ones, drawing the shape of the vibration. Ernst Chladni published the first of these figures in 1787.',
  aboutHowHeading: 'How it works here',
  aboutKeyboardHeading: 'Keyboard',
  aboutCreditsLink: 'Photo and sound credits',

  creditsTitle: 'Credits',
  creditsIntro:
    'Every photo and recording here is shared under a Creative Commons license. Thank you to the people who made them.',
  creditsPhoto: 'Photo',
  creditsSong: 'Song',
  creditsFonts:
    'Typefaces: Archivo by Omnibus-Type and Martian Mono by Evil Martians, both under the SIL Open Font License 1.1.',
  creditsSoftware:
    'Software: Three.js, React, TanStack, Radix UI, shadcn/ui, Tailwind CSS, tw-animate-css, clsx and tailwind-merge, under the MIT License; class-variance-authority, under the Apache License 2.0; icons by Lucide, under the ISC License.',
  creditsBack: 'Back to the birds',
  creditsAll: 'All credits',
  newTabSr: '(opens in a new tab)',
  notFoundTitle: "This page doesn't exist.",
  notFoundLink: 'Back to the birds',
} as const

export const slidePosition = (n: number, total: number) => `${n} of ${total}`
export const gateAria = (name: string) => `Listen to the ${name}`
export const plateAria = (name: string) => `Sand on a circular plate, moved by the ${name}'s song`
export const plateCaptionLive = (mode: string) => `Mode ${mode}`
export const plateCaptionHeld = (mode: string) => (mode ? `Held · mode ${mode}` : 'Held')
export const spectrumAria = (band: string, peak: string) =>
  `Live spectrum. Song band ${band}, peak ${peak}.`
export const nowPlayingAria = (name: string) => `Pause ${name}`
export const announceBird = (
  n: number,
  total: number,
  name: string,
  sci: string,
  iucnLabel: string,
) => `${n} of ${total}: ${name}, ${sci}. ${iucnLabel}.`
export const announceError = (name: string) => `The song for ${name} didn't load.`
export const describeSay = (description: string, hz: string) =>
  hz ? `${description} Following the song at ${hz}.` : description
/** Describe pattern while Hold is on: the frozen pattern, which no longer follows the song. */
export const describeSayHeld = (description: string) => `Held. ${description}`
