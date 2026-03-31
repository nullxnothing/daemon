import { useState, useMemo } from 'react'
import { usePluginStore } from '../../store/plugins'
import { PLUGIN_REGISTRY } from '../../plugins/registry'
import { Dot } from '../../components/Dot'
import { Toggle } from '../../components/Toggle'
import type { PluginManifest } from '../../plugins/registry'
import './PluginDashboard.css'

interface PluginCardProps {
  manifest: PluginManifest
  isEnabled: boolean
  isActive: boolean
  onToggle: (enabled: boolean) => void
  onOpen: () => void
}

function PluginCard({ manifest, isEnabled, isActive, onToggle, onOpen }: PluginCardProps) {
  const Icon = manifest.icon
  return (
    <div
      className={`plugin-card-v2 ${isActive ? 'plugin-card-v2--active' : ''} ${!isEnabled ? 'plugin-card-v2--disabled' : ''}`}
    >
      <div className="plugin-card-v2-header">
        <div className="plugin-card-v2-icon">
          <Icon size={20} />
        </div>
        <div className="plugin-card-v2-title-row">
          <span className="plugin-card-v2-name">{manifest.name}</span>
          <Dot color={isEnabled ? 'green' : 'off'} />
        </div>
      </div>
      <div className="plugin-card-v2-desc">{manifest.description}</div>
      <div className="plugin-card-v2-footer">
        {isActive ? (
          <span className="plugin-card-v2-btn plugin-card-v2-btn--active">Active</span>
        ) : isEnabled ? (
          <button className="plugin-card-v2-btn plugin-card-v2-btn--open" onClick={onOpen}>
            Open
          </button>
        ) : (
          <button
            className="plugin-card-v2-btn plugin-card-v2-btn--enable"
            onClick={() => onToggle(true)}
          >
            Enable
          </button>
        )}
        <Toggle checked={isEnabled} onChange={onToggle} size="sm" />
      </div>
    </div>
  )
}

export function PluginDashboard() {
  const plugins = usePluginStore((s) => s.plugins)
  const activePluginId = usePluginStore((s) => s.activePluginId)
  const toggle = usePluginStore((s) => s.toggle)
  const setActivePlugin = usePluginStore((s) => s.setActivePlugin)
  const [search, setSearch] = useState('')

  const filteredPlugins = useMemo(() => {
    const sorted = [...plugins].sort((a, b) => a.sort_order - b.sort_order)
    if (!search.trim()) return sorted
    const q = search.toLowerCase()
    return sorted.filter((p) => {
      const manifest = PLUGIN_REGISTRY[p.id]
      if (!manifest) return false
      return (
        manifest.name.toLowerCase().includes(q) ||
        manifest.description.toLowerCase().includes(q)
      )
    })
  }, [plugins, search])

  return (
    <div className="plugin-dashboard">
      <header className="plugin-dashboard-header">
        <span className="plugin-dashboard-title">PLUGINS</span>
        <input
          className="plugin-dashboard-search"
          placeholder="Search plugins..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </header>
      <div className="plugin-grid">
        {filteredPlugins.map((plugin) => {
          const manifest = PLUGIN_REGISTRY[plugin.id]
          if (!manifest) return null
          const isEnabled = plugin.enabled === 1
          const isActive = activePluginId === plugin.id
          return (
            <PluginCard
              key={plugin.id}
              manifest={manifest}
              isEnabled={isEnabled}
              isActive={isActive}
              onToggle={(enabled) => toggle(plugin.id, enabled)}
              onOpen={() => setActivePlugin(plugin.id)}
            />
          )
        })}
      </div>
    </div>
  )
}
