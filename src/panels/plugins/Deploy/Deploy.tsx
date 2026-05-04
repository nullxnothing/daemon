import { useState, useEffect, useCallback, useRef } from 'react'
import { useUIStore } from '../../../store/ui'
import { useNotificationsStore, type ActivityArtifact } from '../../../store/notifications'
import { DeployConnect } from './DeployConnect'
import './Deploy.css'

type DeploymentStatus = 'READY' | 'BUILDING' | 'QUEUED' | 'ERROR' | 'CANCELED'

interface PlatformProject {
  id: string
  name: string
}

const STATUS_DOT_CLASS: Record<DeploymentStatus, string> = {
  READY: 'connected',
  BUILDING: 'building',
  QUEUED: 'building',
  ERROR: 'failed',
  CANCELED: 'disconnected',
}

const STATUS_LABEL_CLASS: Record<DeploymentStatus, string> = {
  READY: 'ready',
  BUILDING: 'building',
  QUEUED: 'queued',
  ERROR: 'error',
  CANCELED: 'canceled',
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function platformLabel(platform: DeployPlatform): string {
  return platform === 'vercel' ? 'Vercel' : 'Railway'
}

function projectNameFromPath(projectPath: string | null): string | null {
  if (!projectPath) return null
  const clean = projectPath.replace(/[\\/]+$/, '')
  return clean.split(/[\\/]/).pop() || clean
}

export default function DeployPanel() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const addActivity = useNotificationsStore((s) => s.addActivity)

  const [authStatus, setAuthStatus] = useState<DeployAuthStatus>({
    vercel: { authenticated: false, user: null },
    railway: { authenticated: false, user: null },
  })
  const [statuses, setStatuses] = useState<DeployStatus[]>([])
  const [deployments, setDeployments] = useState<DeploymentEntry[]>([])
  const [loadingDeployments, setLoadingDeployments] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Project picker state
  const [linkingPlatform, setLinkingPlatform] = useState<'vercel' | 'railway' | null>(null)
  const [platformProjects, setPlatformProjects] = useState<PlatformProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [loadingProjects, setLoadingProjects] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadAuthStatus = useCallback(async () => {
    const res = await window.daemon.deploy.authStatus()
    if (res.ok && res.data) setAuthStatus(res.data)
  }, [])

  const loadStatuses = useCallback(async () => {
    if (!activeProjectId) return
    const res = await window.daemon.deploy.status(activeProjectId)
    if (res.ok && res.data) setStatuses(res.data)
  }, [activeProjectId])

  const loadDeployments = useCallback(async () => {
    if (!activeProjectId) return
    setLoadingDeployments(true)
    const allDeploys: DeploymentEntry[] = []
    for (const s of statuses) {
      if (!s.linked) continue
      try {
        const res = await window.daemon.deploy.deployments(activeProjectId, s.platform)
        if (res.ok && res.data) allDeploys.push(...res.data)
      } catch { /* skip */ }
    }
    allDeploys.sort((a, b) => b.createdAt - a.createdAt)
    setDeployments(allDeploys)
    setLoadingDeployments(false)
  }, [activeProjectId, statuses])

  const loadAll = useCallback(async () => {
    await loadAuthStatus()
    await loadStatuses()
  }, [loadAuthStatus, loadStatuses])

  useEffect(() => { loadAll() }, [loadAll])

  useEffect(() => {
    if (statuses.length > 0) loadDeployments()
  }, [statuses, loadDeployments])

  const hasActiveRef = useRef(false)
  const loadDeploymentsRef = useRef(loadDeployments)
  loadDeploymentsRef.current = loadDeployments

  const recordDeployActivity = useCallback((
    platform: DeployPlatform,
    kind: 'info' | 'success' | 'warning' | 'error',
    message: string,
    sessionStatus: 'created' | 'running' | 'blocked' | 'failed' | 'complete',
    artifacts: ActivityArtifact[] = [],
  ) => {
    if (!activeProjectId) return
    addActivity({
      kind,
      context: 'Deploy',
      message,
      sessionId: `deploy-${activeProjectId}-${platform}`,
      sessionStatus,
      projectId: activeProjectId,
      projectName: projectNameFromPath(activeProjectPath),
      artifacts: [
        { type: 'deploy', label: 'Platform', value: platformLabel(platform) },
        ...artifacts,
      ],
    })
  }, [activeProjectId, activeProjectPath, addActivity])

  useEffect(() => {
    hasActiveRef.current = deployments.some((d) => d.status === 'BUILDING' || d.status === 'QUEUED')
  }, [deployments])

  // Poll deployments every 10s if any are building/queued
  useEffect(() => {
    const interval = setInterval(() => {
      if (hasActiveRef.current) loadDeploymentsRef.current()
    }, 10_000)
    return () => clearInterval(interval)
  }, [])

  const handleDeploy = async (platform: DeployPlatform) => {
    if (!activeProjectId) return
    setDeploying(true)
    setError(null)
    recordDeployActivity(platform, 'info', `${platformLabel(platform)} deploy started for ${projectNameFromPath(activeProjectPath) ?? activeProjectId}.`, 'running')
    const res = await window.daemon.deploy.redeploy(activeProjectId, platform)
    if (res.ok) {
      const data = res.data as { id?: string; url?: string | null } | boolean | undefined
      const deployUrl = typeof data === 'object' && data?.url ? data.url : null
      const deployId = typeof data === 'object' && data?.id ? data.id : null
      recordDeployActivity(
        platform,
        'success',
        `${platformLabel(platform)} deploy triggered${deployUrl ? `: ${deployUrl}` : '.'}`,
        'complete',
        [
          ...(deployId ? [{ type: 'deploy' as const, label: 'Deployment ID', value: deployId }] : []),
          ...(deployUrl ? [{ type: 'explorer' as const, label: 'Deploy URL', value: deployUrl, href: deployUrl }] : []),
        ],
      )
      await loadDeployments()
    } else {
      setError(res.error ?? 'Deploy failed')
      recordDeployActivity(platform, 'error', `${platformLabel(platform)} deploy failed: ${res.error ?? 'Deploy failed'}`, 'failed')
    }
    setDeploying(false)
  }

  const handleRefresh = () => { loadAll() }

  const handleConnected = () => {
    loadAuthStatus()
    loadStatuses()
  }

  const handleDisconnect = async (platform: DeployPlatform) => {
    const res = await window.daemon.deploy.disconnect(platform)
    if (res.ok) {
      recordDeployActivity(platform, 'warning', `${platformLabel(platform)} credentials disconnected.`, 'blocked')
      loadAuthStatus()
      loadStatuses()
    }
  }

  const handleStartLink = async (platform: 'vercel' | 'railway') => {
    setLinkingPlatform(platform)
    setLoadingProjects(true)
    const res = platform === 'vercel'
      ? await window.daemon.deploy.vercelProjects()
      : await window.daemon.deploy.railwayProjects()
    if (res.ok && res.data) {
      setPlatformProjects((res.data as Array<{ id: string; name: string }>).map((p) => ({ id: p.id, name: p.name })))
    }
    setLoadingProjects(false)
  }

  const handleLink = async () => {
    if (!activeProjectId || !linkingPlatform || !selectedProjectId) return
    const selected = platformProjects.find((p) => p.id === selectedProjectId)
    if (!selected) return

    const now = Date.now()
    const linkData = linkingPlatform === 'vercel'
      ? { projectId: selectedProjectId, projectName: selected.name, teamId: null, teamSlug: null, productionUrl: null, framework: null, linkedAt: now }
      : { projectId: selectedProjectId, projectName: selected.name, serviceId: '', environmentId: '', productionUrl: null, linkedAt: now }

    const res = await window.daemon.deploy.link(activeProjectId, linkingPlatform, linkData)
    if (res.ok) {
      recordDeployActivity(
        linkingPlatform,
        'success',
        `${platformLabel(linkingPlatform)} project linked: ${selected.name}.`,
        'created',
        [
          { type: 'project', label: 'Deploy project', value: selected.name },
          { type: 'deploy', label: 'Provider project ID', value: selectedProjectId },
        ],
      )
      setLinkingPlatform(null)
      setSelectedProjectId('')
      setPlatformProjects([])
      loadStatuses()
    }
  }

  const handleUnlink = async (platform: DeployPlatform) => {
    if (!activeProjectId) return
    const confirmed = window.confirm(`Unlink ${platform === 'vercel' ? 'Vercel' : 'Railway'} from this project?`)
    if (!confirmed) return
    const res = await window.daemon.deploy.unlink(activeProjectId, platform)
    if (res.ok) {
      recordDeployActivity(platform, 'warning', `${platformLabel(platform)} project unlinked.`, 'blocked')
      loadStatuses()
    }
  }

  const handleOpenUrl = (url: string) => {
    window.daemon.shell.openExternal(url)
  }

  const hasLinked = statuses.some((s) => s.linked)

  if (!activeProjectId) {
    return (
      <div className="deploy-center">
        <div className="deploy-empty">Select a project to manage deployments</div>
      </div>
    )
  }

  return (
    <div className="deploy-center">
      {/* Header */}
      <div className="deploy-header">
        <h2 className="deploy-title">Deploy</h2>
        <div className="deploy-header-spacer" />
        <button className="deploy-btn" onClick={handleRefresh}>Refresh</button>
        {hasLinked && (
          <button
            className="deploy-btn primary"
            onClick={() => {
              const linked = statuses.find((s) => s.linked)
              if (linked) handleDeploy(linked.platform)
            }}
            disabled={deploying}
          >
            {deploying ? 'Deploying...' : 'Deploy'}
          </button>
        )}
      </div>

      {error && (
        <div className="deploy-section" style={{ paddingTop: 8, paddingBottom: 8 }}>
          <div className="deploy-error">{error}</div>
        </div>
      )}

      {/* Platforms */}
      <div className="deploy-section">
        <div className="deploy-section-label">Platforms</div>

        {(['vercel', 'railway'] as const).map((platform) => {
          const auth = authStatus[platform]
          const linked = statuses.find((s) => s.platform === platform && s.linked)
          const isLinking = linkingPlatform === platform

          if (!auth.authenticated) {
            return (
              <div key={platform} style={{ marginBottom: 8 }}>
                <DeployConnect platform={platform} onConnected={handleConnected} />
              </div>
            )
          }

          return (
            <div key={platform} style={{ marginBottom: 8 }}>
              <div className="deploy-platform-row">
                <span className="deploy-dot connected" />
                <span className="deploy-platform-name">
                  {platform === 'vercel' ? 'Vercel' : 'Railway'}
                </span>
                {auth.user && (
                  <span style={{ fontSize: 10, color: 'var(--t3)' }}>{auth.user}</span>
                )}

                {linked ? (
                  <>
                    <span className="deploy-platform-url">{linked.projectName}</span>
                    {linked.productionUrl && (
                      <button
                        className="deploy-link"
                        onClick={() => handleOpenUrl(linked.productionUrl!)}
                      >
                        Open
                      </button>
                    )}
                    <button
                      className="deploy-btn danger"
                      onClick={() => handleUnlink(platform)}
                    >
                      Unlink
                    </button>
                  </>
                ) : isLinking ? (
                  <div className="deploy-project-picker">
                    {loadingProjects ? (
                      <span style={{ fontSize: 10, color: 'var(--t3)' }}>Loading projects...</span>
                    ) : (
                      <>
                        <select
                          value={selectedProjectId}
                          onChange={(e) => setSelectedProjectId(e.target.value)}
                        >
                          <option value="">Select a project...</option>
                          {platformProjects.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <button
                          className="deploy-btn primary"
                          onClick={handleLink}
                          disabled={!selectedProjectId}
                        >
                          Link
                        </button>
                        <button
                          className="deploy-btn"
                          onClick={() => { setLinkingPlatform(null); setPlatformProjects([]) }}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <button className="deploy-btn" onClick={() => handleStartLink(platform)}>
                      Link Project
                    </button>
                    <button
                      className="deploy-btn danger"
                      onClick={() => handleDisconnect(platform)}
                    >
                      Disconnect
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Deployments */}
      <div className="deploy-section">
        <div className="deploy-section-label">Recent Deployments</div>
        {loadingDeployments && deployments.length === 0 ? (
          <div className="deploy-empty">Loading deployments...</div>
        ) : deployments.length === 0 ? (
          <div className="deploy-empty">No deployments yet</div>
        ) : (
          deployments.map((d) => (
            <div key={d.id} className="deploy-row">
              <span className={`deploy-dot ${STATUS_DOT_CLASS[d.status]}`} />
              {d.commitSha && (
                <span className="deploy-hash">{d.commitSha.slice(0, 7)}</span>
              )}
              {d.branch && (
                <span className="deploy-branch">{d.branch}</span>
              )}
              <span className="deploy-msg">
                {d.commitMessage || d.url || d.id.slice(0, 12)}
              </span>
              <span className={`deploy-status ${STATUS_LABEL_CLASS[d.status]}`}>
                {d.status}
              </span>
              <span className="deploy-time">{relativeTime(d.createdAt)}</span>
              {d.url && (
                <button className="deploy-link" onClick={() => handleOpenUrl(d.url!)}>
                  Open
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
