import { useEffect, useState } from 'react'
import { useCapabilityPacksStore } from '../../store/capabilityPacks'
import { CAPABILITY_PACKS } from '../../constants/capabilityPacks'
import type { CapabilityPack } from '../../constants/capabilityPacks'
import { Toggle } from '../../components/Toggle'
import { Card, PanelHeader, StatusDot } from '../../components/Panel'
import { PluginManager } from '../PluginManager/PluginManager'
import styles from './CapabilityManager.module.css'

type Tab = 'packs' | 'plugins'

function PackCard({ pack }: { pack: CapabilityPack }) {
  const setPackEnabled = useCapabilityPacksStore((s) => s.setPackEnabled)
  // Subscribe to the pack's enabled state directly so the toggle re-renders when
  // it flips (isPackEnabled is a stable function ref and would not trigger one).
  const enabledFlag = useCapabilityPacksStore((s) => s.enabledPacks[pack.id])

  const isCore = pack.status === 'core'
  const enabled = isCore || enabledFlag !== false
  const memberCount = pack.toolIds.length + pack.pluginIds.length

  return (
    <Card className={styles.packCard}>
      <div className={styles.packHeader}>
        <StatusDot
          tone={enabled ? 'success' : 'neutral'}
          label={enabled ? `${pack.name} enabled` : `${pack.name} disabled`}
          className={styles.packDot}
        />
        <div className={styles.packInfo}>
          <div className={styles.packNameRow}>
            <span className={styles.packName}>{pack.name}</span>
            {isCore && (
              <span className={styles.packBadgeCore}>Always on</span>
            )}
            {memberCount > 0 && (
              <span className={styles.packBadgeCount}>
                {memberCount} {memberCount === 1 ? 'tool' : 'tools'}
              </span>
            )}
          </div>
          <div className={styles.packDesc}>{pack.description}</div>
          {pack.perfNote && (
            <div className={styles.packPerfNote}>{pack.perfNote}</div>
          )}
        </div>
        <Toggle
          checked={enabled}
          onChange={(next) => { void setPackEnabled(pack.id, next) }}
          disabled={isCore}
        />
      </div>
    </Card>
  )
}

export function CapabilityManager() {
  const [activeTab, setActiveTab] = useState<Tab>('packs')
  const loaded = useCapabilityPacksStore((s) => s.loaded)

  useEffect(() => {
    if (!loaded) {
      void useCapabilityPacksStore.getState().load()
    }
  }, [loaded])

  return (
    <div className={styles.root}>
      <PanelHeader
        kicker="Capability packs"
        title="Enable only what your project needs."
        subtitle="Each pack toggles a set of tools, plugins, and backend services. Core packs are always active."
      />

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'packs' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('packs')}
          aria-pressed={activeTab === 'packs'}
        >
          Packs
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'plugins' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('plugins')}
          aria-pressed={activeTab === 'plugins'}
        >
          Plugins
        </button>
      </div>

      <div className={styles.body}>
        {activeTab === 'packs' && (
          <div className={styles.packList}>
            {CAPABILITY_PACKS.map((pack) => (
              <PackCard key={pack.id} pack={pack} />
            ))}
          </div>
        )}
        {activeTab === 'plugins' && <PluginManager />}
      </div>
    </div>
  )
}
