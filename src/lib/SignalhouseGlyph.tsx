// Signalhouse brand mark — concentric signal/radar sweep over a horizon line.
// Inline SVG so it bundles, scales, and keeps its own cyan-violet gradient regardless
// of the surrounding tool-color tint.
let glyphSeq = 0

export function SignalhouseGlyph({ size = 18 }: { size?: number }) {
  // Unique gradient ids per instance so multiple renders don't collide.
  const uid = `sh-glyph-${(glyphSeq += 1)}`
  const sweepId = `${uid}-sweep`
  const coreId = `${uid}-core`
  const glowId = `${uid}-glow`

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" role="img" aria-hidden="true">
      <defs>
        <linearGradient id={sweepId} x1="4" y1="28" x2="28" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2bd4ff" />
          <stop offset="0.55" stopColor="#5b8cff" />
          <stop offset="1" stopColor="#a875ff" />
        </linearGradient>
        <radialGradient id={coreId} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#dff7ff" />
          <stop offset="0.6" stopColor="#48d6ff" />
          <stop offset="1" stopColor="#3a7bff" />
        </radialGradient>
        <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#7fe8ff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#7fe8ff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* expanding signal arcs */}
      <path d="M 16 16 m -10 0 a 10 10 0 0 1 20 0" stroke={`url(#${sweepId})`} strokeWidth="1.6" strokeLinecap="round" opacity="0.45" />
      <path d="M 16 16 m -6.5 0 a 6.5 6.5 0 0 1 13 0" stroke={`url(#${sweepId})`} strokeWidth="1.8" strokeLinecap="round" opacity="0.7" />
      <path d="M 16 16 m -3 0 a 3 3 0 0 1 6 0" stroke={`url(#${sweepId})`} strokeWidth="2" strokeLinecap="round" />

      {/* radial sweep line */}
      <path d="M 16 16 L 26 7" stroke={`url(#${sweepId})`} strokeWidth="2" strokeLinecap="round" />

      {/* horizon baseline */}
      <path d="M 4 23 L 28 23" stroke={`url(#${sweepId})`} strokeWidth="1.4" strokeLinecap="round" opacity="0.4" />

      {/* signal source node */}
      <circle cx="16" cy="16" r="7" fill={`url(#${glowId})`} />
      <circle cx="16" cy="16" r="2.6" fill={`url(#${coreId})`} />
    </svg>
  )
}
