export function formatCompactUsd(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: value >= 1000 ? 0 : 2 })
}
