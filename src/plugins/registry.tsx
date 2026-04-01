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

function ImageGenIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="14" height="14" rx="2" />
      <circle cx="6.5" cy="6.5" r="1.5" />
      <path d="M16 12l-3.5-3.5L5 16" />
    </svg>
  )
}

function TweetIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h5l2 4-3 5h7l2-5-2-4h-5" />
      <path d="M7 12l-2 4" />
      <path d="M13 3l2-1" />
    </svg>
  )
}

function RemotionIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="14" height="12" rx="2" />
      <polygon points="7,6 7,12 12,9" />
    </svg>
  )
}

function BrowserIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="14" height="14" rx="2" />
      <line x1="2" y1="6" x2="16" y2="6" />
      <circle cx="4.5" cy="4" r="0.5" fill="currentColor" />
      <circle cx="6.5" cy="4" r="0.5" fill="currentColor" />
      <circle cx="8.5" cy="4" r="0.5" fill="currentColor" />
    </svg>
  )
}

function GmailIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="14" height="12" rx="2" />
      <path d="M2 5l7 5 7-5" />
    </svg>
  )
}

function TelegramIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 2L1 8.5l4.5 1.5M16 2L10 16l-4.5-6M16 2L5.5 10" />
    </svg>
  )
}

function SubscriptionsIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="12" height="10" rx="2" />
      <line x1="3" y1="8" x2="15" y2="8" />
      <line x1="7" y1="8" x2="7" y2="14" />
    </svg>
  )
}

function BriefingIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="7" />
      <path d="M9 5v4l3 2" />
    </svg>
  )
}

function DeployIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2v10M9 2L6 5M9 2l3 3" />
      <path d="M15 12v2a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 14v-2" />
    </svg>
  )
}

function ServicesIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2v2M9 14v2M2 9h2M14 9h2" />
      <circle cx="9" cy="9" r="3" />
      <path d="M4.9 4.9l1.4 1.4M11.7 11.7l1.4 1.4M4.9 13.1l1.4-1.4M11.7 6.3l1.4-1.4" />
    </svg>
  )
}

function PumpFunIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2v6M6 5l3-3 3 3" />
      <circle cx="9" cy="13" r="4" />
      <path d="M7.5 13h3" />
    </svg>
  )
}

export const PLUGIN_REGISTRY: Record<string, PluginManifest> = {
  'pumpfun': {
    id: 'pumpfun',
    name: 'PumpFun',
    description: 'Token launches, bonding curve trading, fee collection',
    mountPosition: 'right-panel-tab',
    icon: PumpFunIcon,
    component: lazy(() => import('../panels/plugins/PumpFunTool/PumpFunTool')),
  },
  // Unshipped plugins — uncomment when service/UI implementations are complete
  // 'imagegen': { id: 'imagegen', name: 'Image Gen', description: 'Generate images with AI models', mountPosition: 'right-panel-tab', icon: ImageGenIcon, component: lazy(() => import('../panels/plugins/ImageGen/ImageGen')) },
  // 'tweet-generator': { id: 'tweet-generator', name: 'Tweet Generator', description: 'Draft tweets with your voice profile', mountPosition: 'right-panel-tab', icon: TweetIcon, component: lazy(() => import('../panels/plugins/TweetGenerator/TweetGenerator')) },
  // 'remotion': { id: 'remotion', name: 'Remotion', description: 'Video editor via localhost Remotion', mountPosition: 'center-panel', icon: RemotionIcon, component: lazy(() => import('../panels/plugins/Remotion/Remotion')), companionPanel: lazy(() => import('../panels/plugins/Remotion/RemotionCompanion')) },
  // 'browser': { id: 'browser', name: 'Browser', description: 'Embedded browser view', mountPosition: 'right-panel-tab', icon: BrowserIcon, component: lazy(() => import('../panels/plugins/Browser/Browser')) },
  // 'gmail': { id: 'gmail', name: 'Gmail', description: 'Code catcher and inbox', mountPosition: 'right-panel-tab', icon: GmailIcon, component: lazy(() => import('../panels/plugins/Gmail/Gmail')) },
  // 'telegram': { id: 'telegram', name: 'Telegram', description: 'Full Telegram client', mountPosition: 'right-panel-tab', icon: TelegramIcon, component: lazy(() => import('../panels/plugins/Telegram/Telegram')) },
  // 'subscriptions': { id: 'subscriptions', name: 'Subscriptions', description: 'API subscription tracker', mountPosition: 'right-panel-tab', icon: SubscriptionsIcon, component: lazy(() => import('../panels/plugins/Subscriptions/Subscriptions')) },
  // 'morning-briefing': { id: 'morning-briefing', name: 'Morning Briefing', description: 'Overnight report overlay', mountPosition: 'overlay', icon: BriefingIcon, component: lazy(() => import('../panels/plugins/MorningBriefing/MorningBriefing')) },
  // 'services': { id: 'services', name: 'Services', description: 'Manage background services', mountPosition: 'right-panel-tab', icon: ServicesIcon, component: lazy(() => import('../panels/plugins/Services/Services')) },
  'deploy': {
    id: 'deploy',
    name: 'Deploy',
    description: 'Vercel and Railway deployments',
    mountPosition: 'center-panel',
    icon: DeployIcon,
    component: lazy(() => import('../panels/plugins/Deploy/Deploy')),
  },
}
