export function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      className={`solana-zone-chevron ${collapsed ? 'collapsed' : ''}`}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 4.5 6 7.5 9 4.5" />
    </svg>
  )
}
