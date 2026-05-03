import { lazy, type ComponentType } from 'react'

export type PluginMountPosition = 'right-panel-tab' | 'bottom-widget' | 'overlay' | 'center-panel'

export interface PluginManifest {
  id: string
  name: string
  description: string
  mountPosition: PluginMountPosition
  icon: ComponentType<{ size?: number }>
  component: React.LazyExoticComponent<ComponentType>
  companionPanel?: React.LazyExoticComponent<ComponentType>
}

function DeployIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2v10M9 2L6 5M9 2l3 3" />
      <path d="M15 12v2a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 14v-2" />
    </svg>
  )
}

function JuiceIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 13.5c2.1-4.4 5-7.4 10-9" />
      <path d="M5 5.5h4.5v4.5" />
      <path d="M13 12.5h-4.5V8" />
      <circle cx="5" cy="5.5" r="1.5" />
      <circle cx="13" cy="12.5" r="1.5" />
    </svg>
  )
}

export const PLUGIN_REGISTRY: Record<string, PluginManifest> = {
  deploy: {
    id: 'deploy',
    name: 'Deploy',
    description: 'Vercel and Railway deployments',
    mountPosition: 'center-panel',
    icon: DeployIcon,
    component: lazy(() => import('../panels/plugins/Deploy/Deploy')),
  },
  juice: {
    id: 'juice',
    name: 'Juice',
    description: 'Market-making wallets, PNL, balances, and scouting reports',
    mountPosition: 'center-panel',
    icon: JuiceIcon,
    component: lazy(() => import('../panels/JuicePanel/JuicePanel')),
  },
}
