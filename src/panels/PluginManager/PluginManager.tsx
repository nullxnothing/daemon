import { FormEvent, useMemo, useState } from 'react'
import { usePluginStore } from '../../store/plugins'
import { PLUGIN_REGISTRY } from '../../plugins/registry'
import { Toggle } from '../../components/Toggle'
import { Button } from '../../components/Button'
import { Card, PanelHeader, StatusDot, Toolbar } from '../../components/Panel'
import type { PluginRow } from '../../types/daemon.d'
import './PluginManager.css'

type ExternalPluginConfig = {
  type?: string
  name?: string
  description?: string
  entry?: string
  command?: string
}

type PluginDraft = {
  id: string
  name: string
  description: string
  entry: string
  command: string
}

function parsePluginConfig(plugin: PluginRow): ExternalPluginConfig {
  if (!plugin.config) return {}
  try {
    const parsed = JSON.parse(plugin.config)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function getPluginDisplay(plugin: PluginRow) {
  const manifest = PLUGIN_REGISTRY[plugin.id]
  if (manifest) {
    return {
      name: manifest.name,
      description: manifest.description,
      isExternal: false,
      entry: '',
      command: '',
    }
  }

  const config = parsePluginConfig(plugin)
  return {
    name: config.name?.trim() || plugin.id,
    description: config.description?.trim() || config.entry?.trim() || config.command?.trim() || 'External plugin registered manually',
    isExternal: true,
    entry: config.entry?.trim() || '',
    command: config.command?.trim() || '',
  }
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

const EMPTY_DRAFT: PluginDraft = {
  id: '',
  name: '',
  description: '',
  entry: '',
  command: '',
}

export function PluginManager() {
  const plugins = usePluginStore((s) => s.plugins)
  const add = usePluginStore((s) => s.add)
  const toggle = usePluginStore((s) => s.toggle)
  const reorder = usePluginStore((s) => s.reorder)

  const [draft, setDraft] = useState<PluginDraft>(EMPTY_DRAFT)
  const [idWasEdited, setIdWasEdited] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...plugins].sort((a, b) => a.sort_order - b.sort_order),
    [plugins]
  )

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

  const handleNameChange = (name: string) => {
    setDraft((current) => ({
      ...current,
      name,
      id: idWasEdited ? current.id : slugify(name),
    }))
  }

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault()
    setAddError(null)

    const input = {
      id: slugify(draft.id),
      name: draft.name.trim(),
      description: draft.description.trim(),
      entry: draft.entry.trim(),
      command: draft.command.trim(),
    }

    if (!input.id || !input.name) {
      setAddError('Plugin name and id are required.')
      return
    }

    if (plugins.some((plugin) => plugin.id === input.id)) {
      setAddError('A plugin with this id already exists.')
      return
    }

    setIsAdding(true)
    const ok = await add(input)
    setIsAdding(false)

    if (!ok) {
      setAddError('Plugin could not be added.')
      return
    }

    setDraft(EMPTY_DRAFT)
    setIdWasEdited(false)
  }

  return (
    <div className="plugin-manager">
      <PanelHeader
        kicker="Plugin-first workbench"
        title="Keep DAEMON core lean. Let builders bring the tools."
        subtitle="Register Arena tools, npm packages, CLIs, MCPs, or local workflows here, then enable only the surfaces your project needs."
        actions={(
          <div className="plugin-manager-hero-badges">
            <span>Core shell stays stable</span>
            <span>Add-ons stay optional</span>
            <span>Builders get visible credit</span>
          </div>
        )}
      />

      <div className="plugin-manager-body">
        <Card>
          <form className="plugin-add-card" onSubmit={handleAdd}>
          <div className="plugin-add-header">
            <div>
              <div className="plugin-add-title">Add external plugin</div>
              <div className="plugin-add-subtitle">First step toward Arena/community plugin registration.</div>
            </div>
            <Button variant="primary" size="md" type="submit" disabled={isAdding}>
              {isAdding ? 'Adding...' : 'Add Plugin'}
            </Button>
          </div>

          <div className="plugin-add-grid">
            <label>
              Name
              <input
                value={draft.name}
                onChange={(event) => handleNameChange(event.target.value)}
                placeholder="Bags Launchpad"
              />
            </label>
            <label>
              Plugin ID
              <input
                value={draft.id}
                onChange={(event) => {
                  setIdWasEdited(true)
                  setDraft((current) => ({ ...current, id: slugify(event.target.value) }))
                }}
                placeholder="bags-launchpad"
              />
            </label>
            <label className="plugin-add-wide">
              Description
              <input
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                placeholder="Launchpad integration for DAEMON Arena builders"
              />
            </label>
            <label>
              Entry or docs URL
              <input
                value={draft.entry}
                onChange={(event) => setDraft((current) => ({ ...current, entry: event.target.value }))}
                placeholder="https://..."
              />
            </label>
            <label>
              Command
              <input
                value={draft.command}
                onChange={(event) => setDraft((current) => ({ ...current, command: event.target.value }))}
                placeholder="npx your-plugin"
              />
            </label>
          </div>

          {addError && <div className="plugin-add-error">{addError}</div>}
          </form>
        </Card>

        <div className="plugin-manager-list">
          {sorted.map((plugin, i) => {
            const display = getPluginDisplay(plugin)
            const isEnabled = plugin.enabled === 1

            return (
              <Card key={plugin.id} className="plugin-card">
                <div className="plugin-card-header">
                  <StatusDot tone={isEnabled ? 'success' : 'neutral'} className="plugin-status-dot" />
                  <div className="plugin-card-info">
                    <div className="plugin-card-name-row">
                      <span className="plugin-card-name">{display.name}</span>
                      <span className={display.isExternal ? 'plugin-badge external' : 'plugin-badge'}>
                        {display.isExternal ? 'External' : 'Built-in'}
                      </span>
                    </div>
                    <div className="plugin-card-desc">{display.description}</div>
                    {(display.entry || display.command) && (
                      <div className="plugin-card-meta">
                        {display.entry && <span>{display.entry}</span>}
                        {display.command && <span>{display.command}</span>}
                      </div>
                    )}
                  </div>
                  <Toolbar className="plugin-card-actions">
                    <Button
                      variant="ghost"
                      className="plugin-reorder-btn"
                      onClick={() => handleMoveUp(i)}
                      disabled={i === 0}
                      title="Move up"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 2v8M3 5l3-3 3 3" />
                      </svg>
                    </Button>
                    <Button
                      variant="ghost"
                      className="plugin-reorder-btn"
                      onClick={() => handleMoveDown(i)}
                      disabled={i >= sorted.length - 1}
                      title="Move down"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 10V2M3 7l3 3 3-3" />
                      </svg>
                    </Button>
                    <Toggle
                      checked={isEnabled}
                      onChange={(checked) => toggle(plugin.id, checked)}
                    />
                  </Toolbar>
                </div>
              </Card>
            )
          })}

          {sorted.length === 0 && (
            <div className="plugin-empty-state">
              No plugins registered yet. Add one above or install a first-party module.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
