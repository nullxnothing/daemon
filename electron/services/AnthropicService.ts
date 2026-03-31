interface StatusResult {
  indicator: 'none' | 'minor' | 'major' | 'critical'
  description: string
}

export async function fetchAnthropicStatus(): Promise<StatusResult> {
  const res = await fetch('https://status.claude.com/api/v2/summary.json')
  if (!res.ok) throw new Error(`Status API returned ${res.status}`)

  const data = await res.json()
  return {
    indicator: data.status?.indicator ?? 'none',
    description: data.status?.description ?? 'Unknown',
  }
}
