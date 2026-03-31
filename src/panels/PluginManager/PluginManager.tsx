import { usePluginStore } from '../../store/plugins'
import { PLUGIN_REGISTRY } from '../../plugins/registry'
import { Toggle } from '../../components/Toggle'
import './PluginManager.css'

export function PluginManager() {
  const plugins = usePluginStore((s) => s.plugins)
  const toggle = usePluginStore((s) => s.toggle)
  const reorder = usePluginStore((s) => s.reorder)

  const sorted = [...plugins].sort((a, b) => a.sort_order - b.sort_order)

  const handleMoveUp = (index: number) => {
    if (index === 0) return
    const ids = sorted.map((p) => p.id)
    const temp = ids[index]
    ids[index] = ids[index - 1]
    ids[index - 1] = temp
    reorder(ids)
  }

  const handleMoveDown = (index: number) => {
    if (index >= sorted.length - 1) return
    const ids = sorted.map((p) => p.id)
    const temp = ids[index]
    ids[index] = ids[index + 1]
    ids[index + 1] = temp
    reorder(ids)
  }

  return (
    <div className="plugin-manager">
      <div className="panel-header">PLUGINS</div>
      <div className="plugin-manager-list">
        {sorted.map((plugin, i) => {
          const manifest = PLUGIN_REGISTRY[plugin.id]
          if (!manifest) return null

          const isEnabled = plugin.enabled === 1

          return (
            <div key={plugin.id} className="plugin-card">
              <div className="plugin-card-header">
                <div
                  className="plugin-status-dot"
                  style={{ background: isEnabled ? 'var(--green)' : 'var(--t3)' }}
                />
                <div className="plugin-card-info">
                  <div className="plugin-card-name">{manifest.name}</div>
                  <div className="plugin-card-desc">{manifest.description}</div>
                </div>
                <div className="plugin-card-actions">
                  <button
                    className="plugin-reorder-btn"
                    onClick={() => handleMoveUp(i)}
                    disabled={i === 0}
                    title="Move up"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 2v8M3 5l3-3 3 3" />
                    </svg>
                  </button>
                  <button
                    className="plugin-reorder-btn"
                    onClick={() => handleMoveDown(i)}
                    disabled={i >= sorted.length - 1}
                    title="Move down"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 10V2M3 7l3 3 3-3" />
                    </svg>
                  </button>
                  <Toggle
                    checked={isEnabled}
                    onChange={(checked) => toggle(plugin.id, checked)}
                  />
                </div>
              </div>
            </div>
          )
        })}
        {sorted.length === 0 && (
          <div style={{ padding: '16px 0', fontSize: 11, color: 'var(--t3)' }}>
            No plugins registered
          </div>
        )}
      </div>
    </div>
  )
}
