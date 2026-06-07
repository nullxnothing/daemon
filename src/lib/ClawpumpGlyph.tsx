// ClawPump brand leaf/claw mark. Inline SVG so it bundles, scales, and keeps its
// own green gradient regardless of the surrounding tool-color tint.
const PETAL = 'M 1.67 25.78 C 1.43 26.22 1.58 27.24 1.78 27.56 C 1.98 27.88 2.9 28.22 3.28 28.33 C 3.65 28.45 4.39 28.35 4.78 28.5 C 5.17 28.65 5.92 29.11 6.39 29.5 C 6.85 29.89 8.21 31.2 8.5 31.61 C 8.79 32.02 8.46 32.56 8.72 32.78 C 8.99 33 10.17 33.47 10.61 33.39 C 11.06 33.31 12.03 32.43 12.28 32.17 C 12.52 31.9 12.35 31.37 12.56 31.28 C 12.76 31.19 13.62 31.56 13.94 31.44 C 14.27 31.33 14.94 30.7 15.17 30.33 C 15.39 29.97 15.52 28.61 15.72 28.5 C 15.92 28.39 16.01 29.33 16.78 29.44 C 17.54 29.56 20.69 29.66 21.83 29.39 C 22.98 29.12 25.15 27.81 25.94 27.28 C 26.74 26.74 27.63 25.78 28.17 25.11 C 28.7 24.44 29.91 22.74 30.22 21.89 C 30.53 21.04 30.86 18.76 30.67 18.33 C 30.47 17.91 29.04 18.38 28.67 18.5 C 28.29 18.62 28.03 19.19 27.67 19.33 C 27.31 19.47 26.17 19.46 25.78 19.61 C 25.39 19.76 25.01 20.42 24.56 20.56 C 24.1 20.69 22.68 20.86 22.17 20.72 C 21.65 20.58 20.31 19.9 20.44 19.44 C 20.58 18.99 22.74 17.69 23.22 17.11 C 23.7 16.53 24.17 15.33 24.28 14.78 C 24.38 14.22 23.92 13.05 24.06 12.67 C 24.19 12.28 25.17 12.1 25.33 11.72 C 25.5 11.34 24.78 10.55 25.39 9.61 C 25.99 8.67 29.57 5.08 30.17 4.22 C 30.76 3.36 31.17 2.92 30.17 2.72 C 29.17 2.53 23.78 2.42 22.17 2.67 C 20.56 2.92 18.37 4.1 17.28 4.72 C 16.19 5.35 14.38 6.78 13.44 7.67 C 12.51 8.56 10.51 10.8 9.78 11.83 C 9.05 12.87 7.92 14.92 7.61 15.94 C 7.31 16.97 7.68 19.26 7.33 20 C 6.99 20.74 5.29 21.33 4.83 21.83 C 4.38 22.33 4.06 23.51 3.67 24 C 3.27 24.49 1.9 25.33 1.67 25.78 Z'

let glyphSeq = 0

export function ClawpumpGlyph({ size = 18 }: { size?: number }) {
  // Unique gradient/clip ids per instance so multiple renders don't collide.
  const uid = `cp-glyph-${(glyphSeq += 1)}`
  const baseId = `${uid}-base`
  const topId = `${uid}-top`
  const botId = `${uid}-bot`
  const glowId = `${uid}-glow`
  const clipId = `${uid}-clip`

  return (
    <svg width={size} height={size} viewBox="0 0 33 35" fill="none" role="img" aria-hidden="true">
      <defs>
        <linearGradient id={baseId} x1="3" y1="32" x2="31" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#047a55" />
          <stop offset="0.34" stopColor="#12a96b" />
          <stop offset="0.68" stopColor="#45d283" />
          <stop offset="1" stopColor="#9af8cf" />
        </linearGradient>
        <linearGradient id={topId} x1="9" y1="23" x2="28" y2="1" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#22b873" />
          <stop offset="0.58" stopColor="#4adb8d" />
          <stop offset="1" stopColor="#b6ffe2" />
        </linearGradient>
        <linearGradient id={botId} x1="3" y1="30" x2="32" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0b8d63" />
          <stop offset="0.5" stopColor="#19ae73" />
          <stop offset="1" stopColor="#a9ffe0" />
        </linearGradient>
        <radialGradient id={glowId} cx="36%" cy="38%" r="52%">
          <stop offset="0" stopColor="#dffff4" stopOpacity="0.48" />
          <stop offset="0.5" stopColor="#8effc8" stopOpacity="0.18" />
          <stop offset="1" stopColor="#30d985" stopOpacity="0" />
        </radialGradient>
        <clipPath id={clipId}>
          <path d={PETAL} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <path d={PETAL} fill={`url(#${baseId})`} />
        <path d="M 14.4 2.1 C 19.2 0.8 26 0.8 32.3 1.9 C 29.7 6.4 26.7 10.1 24.2 15 C 22.4 18.5 20.7 22.4 17.4 24.3 C 13.2 25.6 8.8 23.6 7.1 19.6 C 6.9 13.1 9.9 6.3 14.4 2.1 Z" fill={`url(#${topId})`} opacity="0.95" />
        <path d="M 0.1 29 C 5.8 24.7 11.3 22 18.4 22.6 C 23.9 23 27.7 20.5 33 20.5 C 32 24.6 28.4 28.6 24.8 31.2 C 18.5 33.1 13.1 31.7 8.3 34.4 C 5.4 32.8 2.5 31.1 0.1 29 Z" fill={`url(#${botId})`} opacity="0.93" />
        <path d="M 26.4 6.1 C 24 10.2 22.2 14.5 20.8 19.2 C 19.8 22.6 17.7 25.5 14.4 26.1 C 18.9 26.7 23.2 23.4 25.6 18.6 C 27.6 14.6 29 10.2 32.3 3.3 C 30.3 3.9 28.1 4.7 26.4 6.1 Z" fill="#08724f" opacity="0.5" />
        <path d="M 8.5 21.7 C 12.1 22.6 16.8 22.8 22.4 21.8 C 20.1 23.8 17.2 25.3 13.8 25.5 C 10.4 25.6 7.1 24.7 4.9 23.4 C 5.8 22.7 6.9 22.2 8.5 21.7 Z" fill="#008a5f" opacity="0.55" />
        <ellipse cx="14.2" cy="12.4" rx="5.2" ry="10.2" transform="rotate(25 14.2 12.4)" fill={`url(#${glowId})`} />
        <path d="M 6.8 33.1 C 9.4 27.6 10.1 22 10.8 16.4 C 11.5 10.9 13.1 5.8 16 1.9" stroke="#005d44" strokeWidth="1.5" strokeLinecap="round" opacity="0.28" />
        <path d="M 3.4 28.5 C 9.1 26.1 15.6 25.7 22.1 25.2 C 26.8 24.8 29.8 22.7 32.8 20.7" stroke="#004e3b" strokeWidth="1" strokeLinecap="round" opacity="0.22" />
      </g>
      <path d={PETAL} stroke="#07563f" strokeOpacity="0.18" strokeWidth="0.25" />
    </svg>
  )
}
