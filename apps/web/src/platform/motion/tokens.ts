export const motionTokens = {
  duration: {
    micro: 0.15,
    state: 0.22,
    workRoute: 0.2,
    contentRoute: 0.36,
    spatialRoute: 0.46,
    authRoute: 0.48,
    sharedElement: 0.48,
  },
  ease: {
    quiet: 'power3.out',
    standard: 'power2.out',
    route: 'expo.out',
    shared: 'expo.inOut',
  },
} as const;

export const motionMediaQueries = {
  base: '(min-width: 0px)',
  compact: '(max-width: 47.99rem)',
  reducedMotion: '(prefers-reduced-motion: reduce)',
} as const;
