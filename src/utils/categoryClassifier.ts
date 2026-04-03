export type CategoryId = 'development' | 'crypto' | 'communication' | 'infrastructure' | 'ai-ml' | 'other'

export interface CategoryDef {
  id: CategoryId
  label: string
  sortOrder: number
}

export const CATEGORIES: CategoryDef[] = [
  { id: 'development',     label: 'Development',     sortOrder: 0 },
  { id: 'crypto',          label: 'Crypto / Solana',  sortOrder: 1 },
  { id: 'communication',   label: 'Communication',    sortOrder: 2 },
  { id: 'infrastructure',  label: 'Infrastructure',   sortOrder: 3 },
  { id: 'ai-ml',           label: 'AI / ML',          sortOrder: 4 },
  { id: 'other',           label: 'Other',            sortOrder: 5 },
]

// Crypto checked BEFORE development so Solana-specific items land in crypto
const RULES: Array<{ pattern: RegExp; category: CategoryId }> = [
  {
    pattern: /solana|helius|solblade|pump|drift|jupiter|raydium|meteora|orca|dflow|sanctum|kamino|marginfi|switchboard|pyth|metaplex|glam|squads|debridge|lulo|manifest|coingecko|wallet/,
    category: 'crypto',
  },
  {
    pattern: /telegram|gmail|email|tweet|slack|discord/,
    category: 'communication',
  },
  {
    pattern: /github|playwright|browser|code|git|debug|test|build|deploy|surfpool|pinocchio|anchor|typescript|javascript|python|frontend|backend|filesystem/,
    category: 'development',
  },
  {
    pattern: /services|subscriptions|morning|resource|crash|log|health|docker|vercel|railway|quicknode/,
    category: 'infrastructure',
  },
  {
    pattern: /imagegen|claude|anthropic|perplexity|firecrawl|openai|remotion/,
    category: 'ai-ml',
  },
]

export function classifyItem(name: string): CategoryId {
  const lower = name.toLowerCase()
  for (const rule of RULES) {
    if (rule.pattern.test(lower)) return rule.category
  }
  return 'other'
}

export function groupByCategory<T>(items: T[], getName: (item: T) => string): Map<CategoryId, T[]> {
  const groups = new Map<CategoryId, T[]>()
  for (const item of items) {
    const cat = classifyItem(getName(item))
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat)!.push(item)
  }
  return groups
}
