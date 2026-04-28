import { useState, useRef, useEffect, useCallback, useMemo, type ComponentType, type DragEvent } from 'react'
import { useUIStore } from '../../store/ui'
import { usePluginStore } from '../../store/plugins'
import { useWorkspaceProfileStore } from '../../store/workspaceProfile'
import { useWorkflowShellStore } from '../../store/workflowShell'
import { PLUGIN_REGISTRY } from '../../plugins/registry'
import { TOOL_DISPLAY_NAMES } from '../../constants/toolRegistry'
import { lazyNamedWithReload, lazyWithReload } from '../../utils/lazyWithReload'
import './CommandDrawer.css'

// All drawer-renderable tools (built-in + plugins)
interface DrawerTool {
  id: string
  name: string
  description: string
  icon: ComponentType<{ size?: number }>
  component: React.LazyExoticComponent<ComponentType>
  preload?: () => void
  category: 'dev' | 'crypto' | 'create' | 'system'
}

// Built-in tool icons — exported for sidebar pinning
export function GitIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5">
      <defs>
        <linearGradient id="git-flow" x1="3" y1="4" x2="21" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#4ade80" />
        </linearGradient>
      </defs>
      <path d="M8 6.5v8.5a3 3 0 1 0 1.5 2.6V11h5a3 3 0 1 0 0-1.5H9.5V6.5a3 3 0 1 0-1.5 0Z" stroke="url(#git-flow)" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="8" cy="5" r="1.75" fill="#a78bfa"/>
      <circle cx="17" cy="10.25" r="1.75" fill="#8b5cf6"/>
      <circle cx="8" cy="18" r="1.75" fill="#4ade80"/>
    </svg>
  )
}
function EnvIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 3.5 18.5 6M12 12.5l5-5 2.5 2.5-5 5" stroke="#14b8a6" />
      <path d="M11.25 12.75a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78Z" stroke="#f0b429" />
      <circle cx="6.2" cy="17.8" r="1.1" fill="#f0b429" />
    </svg>
  )
}
function DeployIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="deploy-flow" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <path d="M12 3.5v8.5m0-8.5-3 3m3-3 3 3" stroke="url(#deploy-flow)"/>
      <path d="M5 13.5h14v4.25A2.25 2.25 0 0 1 16.75 20H7.25A2.25 2.25 0 0 1 5 17.75V13.5Z" stroke="url(#deploy-flow)"/>
      <path d="M8 16.5h8" stroke="url(#deploy-flow)"/>
    </svg>
  )
}
function EmailIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="14" height="12" rx="2" stroke="#fb923c" />
      <path d="M2.5 5 9 9.75 15.5 5" stroke="#f97316" />
      <path d="M3 13.5 7 9.75M15 13.5l-4-3.75" stroke="#fdba74" opacity="0.8" />
    </svg>
  )
}
function WalletIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="wallet-flow" x1="4" y1="5" x2="21" y2="19" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f472b6" />
          <stop offset="100%" stopColor="#fb7185" />
        </linearGradient>
      </defs>
      <path d="M4 8.25A2.25 2.25 0 0 1 6.25 6h10.5A2.25 2.25 0 0 1 19 8.25V9h1.5A1.5 1.5 0 0 1 22 10.5v4.75a1.75 1.75 0 0 1-1.75 1.75H19v.75A2.25 2.25 0 0 1 16.75 20H6.25A2.25 2.25 0 0 1 4 17.75v-9.5Z" stroke="url(#wallet-flow)"/>
      <path d="M4 9.5h15" stroke="url(#wallet-flow)"/>
      <circle cx="18" cy="13.25" r="1.2" fill="#fb7185"/>
    </svg>
  )
}
function SettingsIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.75 14.1 4.4l1.9-1.2 1.8 1.8-1.2 1.9.65 2.1 2.1.95v2.55l-2.1.95-.65 2.1 1.2 1.9-1.8 1.8-1.9-1.2-2.1.65-.95 2.1H10.95L10 19.95l-2.1-.65-1.9 1.2-1.8-1.8 1.2-1.9-.65-2.1-2.1-.95V9.2l2.1-.95.65-2.1-1.2-1.9 1.8-1.8 1.9 1.2 2.1-.65.95-2.1h2.55L12 3.75Z" stroke="#94a3b8" />
      <circle cx="12" cy="12" r="2.8" stroke="#e2e8f0" />
    </svg>
  )
}
function PortsIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.75" stroke="#38bdf8" />
      <circle cx="12" cy="12" r="2.75" stroke="#67e8f9" />
      <path d="M12 3.25v5.5M12 15.25v5.5M20.75 12h-5.5M8.75 12h-5.5" stroke="#0ea5e9" opacity="0.8" />
    </svg>
  )
}
function ProcessIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.25" y="4.25" width="15.5" height="15.5" rx="2.5" stroke="#f87171" />
      <path d="M4.75 9.75h14.5M9.75 4.75v14.5" stroke="#ef4444" opacity="0.9" />
      <circle cx="14.75" cy="14.75" r="1.1" fill="#fca5a5" />
    </svg>
  )
}
function PaintIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" stroke="#e879f9" />
      <circle cx="8.25" cy="8.25" r="1.4" fill="#f0abfc" />
      <path d="M7.5 14c1.4-2.9 3.05-4.35 4.95-4.35 1.5 0 2.88.82 4.05 2.45" stroke="#d946ef" />
      <path d="M7 17.5h10" stroke="#c026d3" opacity="0.82" />
    </svg>
  )
}
function BrowserIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="browser-flow" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="50%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="9" stroke="url(#browser-flow)" />
      <path d="M3.5 9.5h17" stroke="url(#browser-flow)" />
      <path d="M3.5 14.5h17" stroke="url(#browser-flow)" opacity="0.72" />
      <path d="M12 3a13 13 0 0 1 3.5 9A13 13 0 0 1 12 21a13 13 0 0 1-3.5-9A13 13 0 0 1 12 3Z" stroke="url(#browser-flow)" />
    </svg>
  )
}
function DocsIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="docs-flow" x1="5" y1="2" x2="19" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
      </defs>
      <path d="M7 3.5h8.5L19 7v13.5H7A2.5 2.5 0 0 1 4.5 18V6A2.5 2.5 0 0 1 7 3.5Z" stroke="url(#docs-flow)"/>
      <path d="M15.5 3.5V7H19" stroke="url(#docs-flow)"/>
      <path d="M8 10h7M8 13h7M8 16h5" stroke="url(#docs-flow)"/>
    </svg>
  )
}
function StarterIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="starter-flow" x1="4" y1="20" x2="20" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3ecf8e" />
          <stop offset="100%" stopColor="#60a5fa" />
        </linearGradient>
      </defs>
      <path d="M13.25 3.5 5 13h5l-.5 7.5L19 11h-5.25l-.5-7.5Z" stroke="url(#starter-flow)" />
    </svg>
  )
}
function ScannerIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="scanner-flow" x1="3" y1="4" x2="21" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <path d="M5.5 6.5h13v11h-13z" rx="2" stroke="url(#scanner-flow)"/>
      <path d="M8 4.5H5.5A1.5 1.5 0 0 0 4 6v2.5M20 8.5V6a1.5 1.5 0 0 0-1.5-1.5H16M8 19.5H5.5A1.5 1.5 0 0 1 4 18v-2.5M20 15.5V18a1.5 1.5 0 0 1-1.5 1.5H16" stroke="url(#scanner-flow)"/>
      <path d="M8 12h8" stroke="url(#scanner-flow)"/>
      <path d="M12 9v6" stroke="url(#scanner-flow)" opacity="0.72"/>
    </svg>
  )
}
function DashboardIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="dashboard-flow" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#14b8a6" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="6.5" height="7.5" rx="1.5" stroke="url(#dashboard-flow)"/>
      <rect x="13.5" y="4" width="6.5" height="4.5" rx="1.5" stroke="url(#dashboard-flow)"/>
      <rect x="13.5" y="11.5" width="6.5" height="8.5" rx="1.5" stroke="url(#dashboard-flow)"/>
      <rect x="4" y="14.5" width="6.5" height="5.5" rx="1.5" stroke="url(#dashboard-flow)"/>
    </svg>
  )
}
function SessionsIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="sessions-flow" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="8.5" stroke="url(#sessions-flow)"/>
      <path d="M12 7.5v5l3 1.75" stroke="url(#sessions-flow)"/>
      <path d="M8 4.75 6.5 3.5M16 4.75l1.5-1.25" stroke="url(#sessions-flow)" opacity="0.7"/>
    </svg>
  )
}
function HackathonIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="hackathon-flow" x1="3" y1="5" x2="21" y2="19" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <path d="M4 18.5h16M6 18.5V11a6 6 0 0 1 12 0v7.5" stroke="url(#hackathon-flow)"/>
      <path d="M9 10.5v8M12 8.5v10M15 10.5v8" stroke="url(#hackathon-flow)"/>
      <path d="M4 14h16" stroke="url(#hackathon-flow)" opacity="0.72"/>
    </svg>
  )
}
function PluginsIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="plugins-flow" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
      </defs>
      <path d="M8 5.5h8A2.5 2.5 0 0 1 18.5 8v8a2.5 2.5 0 0 1-2.5 2.5H8A2.5 2.5 0 0 1 5.5 16V8A2.5 2.5 0 0 1 8 5.5Z" stroke="url(#plugins-flow)"/>
      <path d="M12 8v8M8 12h8" stroke="url(#plugins-flow)"/>
    </svg>
  )
}
function RecoveryIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="recovery-flow" x1="3" y1="5" x2="19" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f472b6" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
      </defs>
      <path d="M5 11a7 7 0 1 1 2 5" stroke="url(#recovery-flow)"/>
      <path d="M5 6v5h5" stroke="url(#recovery-flow)"/>
    </svg>
  )
}
function SolanaIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 397.7 311.7">
      <defs>
        <linearGradient id="solana-flow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00FFA3">
            <animate attributeName="stop-color" values="#00FFA3;#DC1FFF;#00FFA3" dur="4s" repeatCount="indefinite" />
          </stop>
          <stop offset="50%" stopColor="#9945FF">
            <animate attributeName="stop-color" values="#9945FF;#00FFA3;#9945FF" dur="4s" repeatCount="indefinite" />
          </stop>
          <stop offset="100%" stopColor="#DC1FFF">
            <animate attributeName="stop-color" values="#DC1FFF;#9945FF;#DC1FFF" dur="4s" repeatCount="indefinite" />
          </stop>
        </linearGradient>
      </defs>
      <path fill="url(#solana-flow)" d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z"/>
      <path fill="url(#solana-flow)" d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z"/>
      <path fill="url(#solana-flow)" d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z"/>
    </svg>
  )
}
function IntegrationsIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="integrations-flow" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#14f195" />
          <stop offset="55%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <path d="M7.5 7.5h9v9h-9z" stroke="url(#integrations-flow)" />
      <path d="M4 12h3.5M16.5 12H20M12 4v3.5M12 16.5V20" stroke="url(#integrations-flow)" opacity="0.72" />
      <circle cx="12" cy="12" r="1.75" fill="#14f195" />
      <circle cx="4" cy="12" r="1.15" fill="#38bdf8" />
      <circle cx="20" cy="12" r="1.15" fill="#a78bfa" />
      <circle cx="12" cy="4" r="1.15" fill="#38bdf8" />
      <circle cx="12" cy="20" r="1.15" fill="#a78bfa" />
    </svg>
  )
}
function ReadinessIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="readiness-flow" x1="4" y1="20" x2="20" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#14f195" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="8.5" stroke="url(#readiness-flow)" />
      <path d="M8 12.4 10.8 15.1 16.3 8.8" stroke="url(#readiness-flow)" strokeWidth="1.8" />
      <path d="M12 3.5v2M20.5 12h-2M12 20.5v-2M3.5 12h2" stroke="currentColor" opacity="0.58" />
    </svg>
  )
}
function TokenLaunchIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="token-launch-flow" x1="4" y1="18" x2="20" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#14f195" />
          <stop offset="100%" stopColor="#2dd4bf" />
        </linearGradient>
      </defs>
      <path d="M8 15c-1.8 1.5-2.6 4-2 6 2 .5 4.4-.3 5.9-2l6.5-7.25A3 3 0 0 0 14.2 7.6L8 15Z" stroke="url(#token-launch-flow)"/>
      <path d="M9.5 8.5 5 4M5 8.5 9.5 4" stroke="url(#token-launch-flow)" opacity="0.72"/>
      <path d="M15 4h5v5" stroke="url(#token-launch-flow)"/>
    </svg>
  )
}
function ProIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5 14.68 8.92l5.98.86-4.33 4.22 1.02 5.96L12 17.15 6.65 19.96l1.02-5.96-4.33-4.22 5.98-.86L12 3.5Z" stroke="#facc15" />
      <path d="M12 8.2v5.1" stroke="#fde68a" />
      <circle cx="12" cy="16" r="0.9" fill="#fde68a" />
    </svg>
  )
}
function ActivityIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="activity-flow" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#14f195" />
          <stop offset="50%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#facc15" />
        </linearGradient>
      </defs>
      <path d="M4 17.5h16" stroke="url(#activity-flow)" opacity="0.5" />
      <path d="M6 15V8.5M12 15V5.5M18 15v-4" stroke="url(#activity-flow)" />
      <circle cx="6" cy="8.5" r="2" stroke="url(#activity-flow)" />
      <circle cx="12" cy="5.5" r="2" stroke="url(#activity-flow)" />
      <circle cx="18" cy="11" r="2" stroke="url(#activity-flow)" />
    </svg>
  )
}

// Icon lookup for pinned sidebar tools
function AgentStationIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="agent-station-grad" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#9945ff" />
          <stop offset="100%" stopColor="#3ecf8e" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="16" height="12" rx="3" stroke="url(#agent-station-grad)" />
      <circle cx="8.5" cy="10" r="1.5" fill="#9945ff" />
      <circle cx="12" cy="10" r="1.5" fill="#7b5ea7" />
      <circle cx="15.5" cy="10" r="1.5" fill="#3ecf8e" />
      <path d="M9 16v4M15 16v4M7 20h10" stroke="url(#agent-station-grad)" />
    </svg>
  )
}

export const TOOL_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  git: GitIcon, deploy: DeployIcon, env: EnvIcon,
  wallet: WalletIcon, email: EmailIcon, browser: BrowserIcon,
  ports: PortsIcon, processes: ProcessIcon, settings: SettingsIcon,
  'image-editor': PaintIcon, 'solana-toolbox': SolanaIcon, 'block-scanner': ScannerIcon, docs: DocsIcon, starter: StarterIcon,
  'token-launch': TokenLaunchIcon, integrations: IntegrationsIcon, 'project-readiness': ReadinessIcon,
  dashboard: DashboardIcon, sessions: SessionsIcon, hackathon: HackathonIcon, plugins: PluginsIcon, recovery: RecoveryIcon, pro: ProIcon, activity: ActivityIcon,
  'agent-station': AgentStationIcon,
}

// Tool name lookup
export const TOOL_NAMES: Record<string, string> = { ...TOOL_DISPLAY_NAMES }

// Lazy-load all tool components
const loadGitPanel = () => import('../../panels/GitPanel/GitPanel')
const loadEnvManager = () => import('../../panels/EnvManager/EnvManager')
const loadDeployPanel = () => import('../../panels/plugins/Deploy/Deploy')
const loadEmailPanel = () => import('../../panels/plugins/Email/EmailPanel')
const loadWalletPanel = () => import('../../panels/WalletPanel/WalletPanel')
const loadSettingsPanel = () => import('../../panels/SettingsPanel/SettingsPanel')
const loadPortsPanel = () => import('../../panels/PortsPanel/PortsPanel')
const loadProcessManager = () => import('../../panels/ProcessManager/ProcessManager')
const loadImageEditor = () => import('../../panels/ImageEditor/ImageEditor')
const loadSolanaToolbox = () => import('../../panels/SolanaToolbox/SolanaToolbox')
const loadIntegrationCommandCenter = () => import('../../panels/IntegrationCommandCenter/IntegrationCommandCenter')
const loadProjectReadiness = () => import('../../panels/ProjectReadiness/ProjectReadiness')
const loadTokenLaunchTool = () => import('../../panels/TokenLaunchTool/TokenLaunchTool')
const loadBlockScanner = () => import('../../panels/BlockScanner/BlockScanner')
const loadDocsPanel = () => import('../../panels/DocsPanel/DocsPanel')
const loadProjectStarter = () => import('../../panels/ProjectStarter/ProjectStarter')
const loadDashboardCanvas = () => import('../../panels/Dashboard/DashboardCanvas')
const loadSessionHistory = () => import('../../panels/SessionRegistry/SessionHistory')
const loadHackathonPanel = () => import('../../panels/Colosseum/HackathonPanel')
const loadPluginManager = () => import('../../panels/PluginManager/PluginManager')
const loadRecoveryPanel = () => import('../../panels/RecoveryPanel/RecoveryPanel')
const loadProPanel = () => import('../../panels/ProPanel/ProPanel')
const loadActivityTimeline = () => import('../../panels/ActivityTimeline/ActivityTimeline')
const loadAgentStation = () => import('../../panels/AgentStation/AgentStation')

const GitPanel = lazyNamedWithReload('git-panel', loadGitPanel, (m) => m.GitPanel)
const EnvManager = lazyNamedWithReload('env-manager', loadEnvManager, (m) => m.EnvManager)
const DeployPanel = lazyWithReload('deploy-panel', loadDeployPanel)
const EmailPanel = lazyWithReload('email-panel', loadEmailPanel)
const WalletPanel = lazyNamedWithReload('wallet-panel', loadWalletPanel, (m) => m.WalletPanel)
const SettingsPanel = lazyNamedWithReload('settings-panel', loadSettingsPanel, (m) => m.SettingsPanel)
const PortsPanel = lazyNamedWithReload('ports-panel', loadPortsPanel, (m) => m.PortsPanel)
const ProcessManager = lazyNamedWithReload('process-manager', loadProcessManager, (m) => m.ProcessManager)
const ImageEditor = lazyWithReload('image-editor', loadImageEditor)
const SolanaToolbox = lazyWithReload('solana-toolbox', loadSolanaToolbox)
const IntegrationCommandCenter = lazyWithReload('integration-command-center', loadIntegrationCommandCenter)
const ProjectReadiness = lazyWithReload('project-readiness', loadProjectReadiness)
const TokenLaunchTool = lazyWithReload('token-launch-tool', loadTokenLaunchTool)
const BlockScanner = lazyWithReload('block-scanner', loadBlockScanner)
const DocsPanel = lazyNamedWithReload('docs-panel', loadDocsPanel, (m) => m.DocsPanel)
const ProjectStarter = lazyWithReload('project-starter', loadProjectStarter)
const DashboardCanvas = lazyNamedWithReload('dashboard-canvas', loadDashboardCanvas, (m) => m.DashboardCanvas)
const SessionHistory = lazyNamedWithReload('session-history', loadSessionHistory, (m) => m.SessionHistory)
const HackathonPanel = lazyNamedWithReload('hackathon-panel', loadHackathonPanel, (m) => m.HackathonPanel)
const PluginManager = lazyNamedWithReload('plugin-manager', loadPluginManager, (m) => m.PluginManager)
const RecoveryPanel = lazyNamedWithReload('recovery-panel', loadRecoveryPanel, (m) => m.RecoveryPanel)
const ProPanel = lazyNamedWithReload('pro-panel', loadProPanel, (m) => m.ProPanel)
const ActivityTimeline = lazyNamedWithReload('activity-timeline', loadActivityTimeline, (m) => m.ActivityTimeline)
const AgentStationPanel = lazyNamedWithReload('agent-station', loadAgentStation, (m) => m.AgentStation)

// Per-tool accent colors for the drawer grid and sidebar
export const TOOL_COLORS: Record<string, string> = {
  starter: '#3ecf8e',
  git: '#a78bfa',
  deploy: '#60a5fa',
  env: '#f0b429',
  wallet: '#f472b6',
  email: '#fb923c',
  browser: '#60a5fa',
  ports: '#38bdf8',
  processes: '#ef5350',
  settings: '#9ca3af',
  'image-editor': '#e879f9',
  'solana-toolbox': '#14f195',
  integrations: '#38bdf8',
  'project-readiness': '#14f195',
  'token-launch': '#38d39f',
  'block-scanner': '#38bdf8',
  docs: '#f59e0b',
  dashboard: '#22c55e',
  sessions: '#0ea5e9',
  hackathon: '#f59e0b',
  plugins: '#cbd5e1',
  recovery: '#ec4899',
  pro: '#ffd700',
  activity: '#14f195',
  'agent-station': '#9945ff',
}

// Built-in tools registry — exported so other modules can enumerate all tool IDs
// Note: 'browser' is intentionally excluded — it opens as a pinned editor tab (Ctrl+Shift+B), not a drawer panel
export const BUILTIN_TOOLS: DrawerTool[] = [
  { id: 'starter', name: 'New Project', description: 'Scaffold a Solana project with AI', icon: StarterIcon, component: ProjectStarter, preload: () => { void loadProjectStarter() }, category: 'dev' },
  { id: 'git', name: 'Git', description: 'Source control', icon: GitIcon, component: GitPanel, preload: () => { void loadGitPanel() }, category: 'dev' },
  { id: 'deploy', name: 'Deploy', description: 'Vercel & Railway', icon: DeployIcon, component: DeployPanel, preload: () => { void loadDeployPanel() }, category: 'dev' },
  { id: 'env', name: 'Env', description: 'Environment variables', icon: EnvIcon, component: EnvManager, preload: () => { void loadEnvManager() }, category: 'dev' },
  { id: 'wallet', name: 'Wallet', description: 'Solana wallets', icon: WalletIcon, component: WalletPanel, preload: () => { void loadWalletPanel() }, category: 'crypto' },
  { id: 'email', name: 'Email', description: 'Gmail & iCloud', icon: EmailIcon, component: EmailPanel, preload: () => { void loadEmailPanel() }, category: 'create' },
  { id: 'ports', name: 'Ports', description: 'Port scanner', icon: PortsIcon, component: PortsPanel, preload: () => { void loadPortsPanel() }, category: 'system' },
  { id: 'processes', name: 'Processes', description: 'System monitor', icon: ProcessIcon, component: ProcessManager, preload: () => { void loadProcessManager() }, category: 'system' },
  { id: 'settings', name: 'Settings', description: 'App configuration', icon: SettingsIcon, component: SettingsPanel, preload: () => { void loadSettingsPanel() }, category: 'system' },
  { id: 'image-editor', name: 'Image Editor', description: 'Edit images with layers & filters', icon: PaintIcon, component: ImageEditor, preload: () => { void loadImageEditor() }, category: 'create' },
  { id: 'token-launch', name: 'Token Launch', description: 'Unified Pump.fun, Raydium, and Meteora launch workflow', icon: TokenLaunchIcon, component: TokenLaunchTool, preload: () => { void loadTokenLaunchTool() }, category: 'crypto' },
  { id: 'project-readiness', name: 'Project Readiness', description: 'Solana project, wallet, RPC, MCP, and first-action checklist', icon: ReadinessIcon, component: ProjectReadiness, preload: () => { void loadProjectReadiness() }, category: 'crypto' },
  { id: 'solana-toolbox', name: 'Solana', description: 'Solana tools, MCPs, validator', icon: SolanaIcon, component: SolanaToolbox, preload: () => { void loadSolanaToolbox() }, category: 'crypto' },
  { id: 'integrations', name: 'Integrations', description: 'Guided Solana integration setup and safe checks', icon: IntegrationsIcon, component: IntegrationCommandCenter, preload: () => { void loadIntegrationCommandCenter() }, category: 'crypto' },
  { id: 'block-scanner', name: 'Block Scanner', description: 'Solana explorer powered by Orb', icon: ScannerIcon, component: BlockScanner, preload: () => { void loadBlockScanner() }, category: 'crypto' },
  { id: 'docs', name: 'Docs', description: 'DAEMON documentation', icon: DocsIcon, component: DocsPanel, preload: () => { void loadDocsPanel() }, category: 'system' },
  { id: 'dashboard', name: 'Dashboard', description: 'Market data and watchlist', icon: DashboardIcon, component: DashboardCanvas, preload: () => { void loadDashboardCanvas() }, category: 'crypto' },
  { id: 'sessions', name: 'Sessions', description: 'Agent session history', icon: SessionsIcon, component: SessionHistory, preload: () => { void loadSessionHistory() }, category: 'dev' },
  { id: 'hackathon', name: 'Hackathon', description: 'Colosseum tracker', icon: HackathonIcon, component: HackathonPanel, preload: () => { void loadHackathonPanel() }, category: 'crypto' },
  { id: 'pro', name: 'Daemon Pro', description: 'Arena, Pro skills, MCP sync, and priority API', icon: ProIcon, component: ProPanel, preload: () => { void loadProPanel() }, category: 'crypto' },
  { id: 'activity', name: 'Activity', description: 'Flight recorder for Solana development', icon: ActivityIcon, component: ActivityTimeline, preload: () => { void loadActivityTimeline() }, category: 'system' },
  { id: 'plugins', name: 'Plugins', description: 'Manage plugins', icon: PluginsIcon, component: PluginManager, preload: () => { void loadPluginManager() }, category: 'system' },
  { id: 'recovery', name: 'Recovery', description: 'Crash recovery and snapshots', icon: RecoveryIcon, component: RecoveryPanel, preload: () => { void loadRecoveryPanel() }, category: 'system' },
  { id: 'agent-station', name: 'Agent Station', description: 'Scaffold and run Solana AI agents powered by SAK', icon: AgentStationIcon, component: AgentStationPanel, preload: () => { void loadAgentStation() }, category: 'crypto' },
]

const BUILTIN_TOOL_PRELOADERS = new Map(
  BUILTIN_TOOLS
    .filter((tool) => typeof tool.preload === 'function')
    .map((tool) => [tool.id, tool.preload as () => void]),
)

export function preloadToolPanel(toolId: string) {
  BUILTIN_TOOL_PRELOADERS.get(toolId)?.()
}

function getDrawerTools(toolVisibility: Record<string, boolean>): DrawerTool[] {
  const tools = [...BUILTIN_TOOLS]

  // Add enabled plugins
  const plugins = usePluginStore.getState().plugins
  for (const p of plugins) {
    if (!p.enabled) continue
    const manifest = PLUGIN_REGISTRY[p.id]
    if (!manifest) continue
    // Skip plugins already represented as built-in tools
    if (BUILTIN_TOOLS.some(t => t.id === p.id)) continue
    tools.push({
      id: p.id,
      name: manifest.name,
      description: manifest.description,
      icon: manifest.icon,
      component: manifest.component,
      category: 'crypto',
    })
  }

  // Filter by workspace profile visibility
  return tools.filter((t) => {
    if (t.id === 'settings') return true
    if (!(t.id in toolVisibility)) return true
    return toolVisibility[t.id]
  })
}

// Shared MIME type for tool drag-and-drop (drawer <-> sidebar)
export const TOOL_DND_MIME = 'application/x-daemon-tool'

export function CommandDrawer() {
  const drawerOpen = useWorkflowShellStore((s) => s.drawerOpen)
  const drawerToolOrder = useUIStore((s) => s.drawerToolOrder)
  const openWorkspaceTool = useUIStore((s) => s.openWorkspaceTool)
  const closeDrawer = useWorkflowShellStore((s) => s.closeDrawer)

  const [search, setSearch] = useState('')
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  const plugins = usePluginStore((s) => s.plugins)
  const toolVisibility = useWorkspaceProfileStore((s) => s.toolVisibility)
  const rawTools = useMemo(() => getDrawerTools(toolVisibility), [plugins, toolVisibility]) // eslint-disable-line react-hooks/exhaustive-deps

  // Apply custom ordering if set
  const allTools = useMemo(() => {
    if (!drawerToolOrder.length) return rawTools
    const byId = new Map(rawTools.map((t) => [t.id, t]))
    const ordered: DrawerTool[] = []
    for (const id of drawerToolOrder) {
      const tool = byId.get(id)
      if (tool) { ordered.push(tool); byId.delete(id) }
    }
    // Append any tools not in the saved order (new tools)
    for (const tool of byId.values()) ordered.push(tool)
    return ordered
  }, [rawTools, drawerToolOrder])

  const filteredTools = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allTools
    return allTools.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q)
    )
  }, [allTools, search])

  // Focus search input when drawer opens in grid mode
  useEffect(() => {
    if (drawerOpen) {
      setTimeout(() => searchRef.current?.focus(), 50)
    }
  }, [drawerOpen])

  useEffect(() => {
    if (!drawerOpen) return
    const visibleToolIds = filteredTools
      .slice(0, 8)
      .map((tool) => tool.id)

    let cancelled = false
    const prewarmVisibleTools = () => {
      if (cancelled) return
      visibleToolIds.forEach((toolId) => preloadToolPanel(toolId))
    }

    const idleCallback = (window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }).requestIdleCallback

    if (typeof idleCallback === 'function') {
      const idleId = idleCallback(prewarmVisibleTools, { timeout: 1200 })
      return () => {
        cancelled = true
        window.cancelIdleCallback?.(idleId)
      }
    }

    const timeoutId = window.setTimeout(prewarmVisibleTools, 75)
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [drawerOpen, filteredTools])

  // Esc to close or go back to grid
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (document.querySelector('.agent-launcher-overlay, .palette-overlay')) return
      e.preventDefault()
      e.stopPropagation()
      closeDrawer()
    }
  }, [closeDrawer])

  useEffect(() => {
    if (!drawerOpen) return
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [drawerOpen, handleKeyDown])

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && filteredTools.length > 0) {
      e.preventDefault()
      openWorkspaceTool(filteredTools[0].id)
      setSearch('')
    }
  }

  const handleToolClick = (toolId: string) => {
    preloadToolPanel(toolId)
    openWorkspaceTool(toolId)
    setSearch('')
  }

  // --- Drag-and-drop for reordering ---
  const handleDragStart = useCallback((e: DragEvent<HTMLButtonElement>, toolId: string) => {
    e.dataTransfer.setData(TOOL_DND_MIME, toolId)
    e.dataTransfer.effectAllowed = 'move'
    ;(e.currentTarget as HTMLElement).classList.add('drawer-tool-card--dragging')
  }, [])

  const handleDragEnd = useCallback((e: DragEvent<HTMLButtonElement>) => {
    ;(e.currentTarget as HTMLElement).classList.remove('drawer-tool-card--dragging')
    setDragOverIdx(null)
  }, [])

  const handleCardDragOver = useCallback((e: DragEvent<HTMLButtonElement>, idx: number) => {
    if (!e.dataTransfer.types.includes(TOOL_DND_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIdx(idx)
  }, [])

  const handleCardDrop = useCallback((e: DragEvent<HTMLButtonElement>, targetIdx: number) => {
    e.preventDefault()
    setDragOverIdx(null)
    const draggedId = e.dataTransfer.getData(TOOL_DND_MIME)
    if (!draggedId) return
    const currentOrder = allTools.map((t) => t.id)
    const fromIdx = currentOrder.indexOf(draggedId)
    if (fromIdx === -1 || fromIdx === targetIdx) return
    currentOrder.splice(fromIdx, 1)
    currentOrder.splice(targetIdx, 0, draggedId)
    useUIStore.getState().setDrawerToolOrder(currentOrder)
  }, [allTools])

  if (!drawerOpen) return null

  return (
    <div className="command-drawer" ref={drawerRef}>
      {/* Header */}
      <div className="drawer-header">
        <input
          ref={searchRef}
          className="drawer-search"
          placeholder="Search tools..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
        <button className="drawer-close" onClick={closeDrawer} title="Close (Esc)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="drawer-content">
        <DrawerGrid
          tools={filteredTools}
          search={search}
          dragOverIdx={dragOverIdx}
          onToolClick={handleToolClick}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onCardDragOver={handleCardDragOver}
          onCardDragLeave={() => setDragOverIdx(null)}
          onCardDrop={handleCardDrop}
        />
      </div>
    </div>
  )
}

// --- Drawer grid (categorized when not searching, flat when searching) ---

const CATEGORY_LABELS: Record<DrawerTool['category'], string> = {
  dev: 'Development',
  crypto: 'Crypto',
  create: 'Create',
  system: 'System',
}

const CATEGORY_ORDER: DrawerTool['category'][] = ['dev', 'crypto', 'create', 'system']

interface DrawerGridProps {
  tools: DrawerTool[]
  search: string
  dragOverIdx: number | null
  onToolClick: (id: string) => void
  onDragStart: (e: DragEvent<HTMLButtonElement>, id: string) => void
  onDragEnd: (e: DragEvent<HTMLButtonElement>) => void
  onCardDragOver: (e: DragEvent<HTMLButtonElement>, idx: number) => void
  onCardDragLeave: () => void
  onCardDrop: (e: DragEvent<HTMLButtonElement>, idx: number) => void
}

function DrawerGrid({
  tools, search, dragOverIdx,
  onToolClick, onDragStart, onDragEnd, onCardDragOver, onCardDragLeave, onCardDrop,
}: DrawerGridProps) {
  if (tools.length === 0) {
    return <div className="drawer-empty">No tools match "{search}"</div>
  }

  // When searching, render a flat grid
  if (search) {
    return (
      <div className="drawer-grid">
        {tools.map((tool, idx) => (
          <DrawerCard
            key={tool.id}
            tool={tool}
            idx={idx}
            isDropTarget={dragOverIdx === idx}
            onClick={onToolClick}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onCardDragOver={onCardDragOver}
            onCardDragLeave={onCardDragLeave}
            onCardDrop={onCardDrop}
          />
        ))}
      </div>
    )
  }

  // When browsing, render categorized sections
  const grouped = new Map<DrawerTool['category'], DrawerTool[]>()
  for (const tool of tools) {
    const arr = grouped.get(tool.category) ?? []
    arr.push(tool)
    grouped.set(tool.category, arr)
  }

  // Use a global index across categories so the drag-drop reorder still works
  let globalIdx = 0
  return (
    <div className="drawer-grid-categorized">
      {CATEGORY_ORDER.filter((c) => grouped.has(c)).map((category) => (
        <section key={category} className="drawer-category-section">
          <div className="drawer-category-header">{CATEGORY_LABELS[category]}</div>
          <div className="drawer-grid">
            {grouped.get(category)!.map((tool) => {
              const idx = globalIdx++
              return (
                <DrawerCard
                  key={tool.id}
                  tool={tool}
                  idx={idx}
                  isDropTarget={dragOverIdx === idx}
                  onClick={onToolClick}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onCardDragOver={onCardDragOver}
                  onCardDragLeave={onCardDragLeave}
                  onCardDrop={onCardDrop}
                />
              )
            })}
          </div>
        </section>
      ))}
      <div className="drawer-hint">Drag favorites to sidebar</div>
    </div>
  )
}

interface DrawerCardProps {
  tool: DrawerTool
  idx: number
  isDropTarget: boolean
  onClick: (id: string) => void
  onDragStart: (e: DragEvent<HTMLButtonElement>, id: string) => void
  onDragEnd: (e: DragEvent<HTMLButtonElement>) => void
  onCardDragOver: (e: DragEvent<HTMLButtonElement>, idx: number) => void
  onCardDragLeave: () => void
  onCardDrop: (e: DragEvent<HTMLButtonElement>, idx: number) => void
}

function DrawerCard({
  tool, idx, isDropTarget,
  onClick, onDragStart, onDragEnd, onCardDragOver, onCardDragLeave, onCardDrop,
}: DrawerCardProps) {
  const Icon = tool.icon
  const color = TOOL_COLORS[tool.id] ?? '#3ecf8e'
  return (
    <button
      className={`drawer-tool-card${isDropTarget ? ' drawer-tool-card--drop-target' : ''}`}
      style={{ '--tool-color': color, '--tool-glow': `${color}20` } as React.CSSProperties}
      draggable
      onClick={() => onClick(tool.id)}
      onDragStart={(e) => onDragStart(e, tool.id)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => onCardDragOver(e, idx)}
      onDragLeave={onCardDragLeave}
      onDrop={(e) => onCardDrop(e, idx)}
      onMouseEnter={tool.preload}
      onFocus={tool.preload}
    >
      <div className="drawer-tool-icon"><Icon size={20} /></div>
      <div className="drawer-tool-name">{tool.name}</div>
      <div className="drawer-tool-desc">{tool.description}</div>
    </button>
  )
}
