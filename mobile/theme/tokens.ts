export const colors = {
  bg: '#0a0a0a',
  s1: '#111111',
  s2: '#161616',
  s3: '#1c1c1c',
  s4: '#242424',
  s5: '#2e2e2e',
  s6: '#383838',

  t1: '#e8e8e8',
  t2: '#a0a0a0',
  t3: '#777777',
  t4: '#505050',

  green: '#3ecf8e',
  greenDim: '#2a9d6a',
  greenGlow: 'rgba(62, 207, 142, 0.12)',

  amber: '#f0b429',
  amberDim: '#c99a22',
  amberGlow: 'rgba(240, 180, 41, 0.12)',

  red: '#ef5350',
  redDim: '#c94442',
  redGlow: 'rgba(239, 83, 80, 0.12)',

  blue: '#60a5fa',
  blueDim: '#4a8ad4',
  blueGlow: 'rgba(96, 165, 250, 0.12)',

  purple: '#a78bfa',
  purpleDim: '#8b6fdf',
  purpleGlow: 'rgba(167, 139, 250, 0.12)',

  border: '#1e1e1e',
  borderLight: '#2a2a2a',

  hoverOverlay: 'rgba(255, 255, 255, 0.03)',
  activeOverlay: 'rgba(255, 255, 255, 0.06)',
} as const;

export const fonts = {
  ui: 'Inter',
  code: 'JetBrainsMono',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 2,
  md: 4,
  lg: 6,
  xl: 10,
  full: 9999,
} as const;

export const fontSize = {
  xxs: 9,
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 28,
} as const;

export type ColorKey = keyof typeof colors;
export type SpacingKey = keyof typeof spacing;
