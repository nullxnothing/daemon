interface SummaryCardProps {
  summary: string | null
  loading: boolean
}

export function SummaryCard({ summary, loading }: SummaryCardProps) {
  if (loading) {
    return (
      <div className="email__summary email__summary--loading">
        Generating summary...
      </div>
    )
  }

  if (!summary) return null

  return <div className="email__summary">{summary}</div>
}
