export function middleEllipsis(value: string, head = 6, tail = 6): string {
  if (value.length <= head + tail + 3) return value
  return `${value.slice(0, head)}...${value.slice(-tail)}`
}

export function middleEllipsisPath(path: string, maxLength = 54): string {
  if (path.length <= maxLength) return path

  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length > 2) {
    const root = normalized.startsWith('/') ? `/${parts[0]}` : parts[0]
    const tail = parts.slice(-2).join('/')
    const label = `${root}/.../${tail}`
    if (label.length <= maxLength) return label
  }

  const head = Math.max(12, Math.floor((maxLength - 3) * 0.42))
  const tail = Math.max(12, maxLength - head - 3)
  return middleEllipsis(path, head, tail)
}

export function compactPathLabel(path: string | null | undefined, fallback = 'No project'): string {
  if (!path) return fallback
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  return parts.slice(-2).join('/') || path
}

export function compactAddress(value: string | null | undefined, head = 4, tail = 4, fallback = 'N/A'): string {
  if (!value) return fallback
  return middleEllipsis(value, head, tail)
}
