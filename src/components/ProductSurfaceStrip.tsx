import { getProductSurface } from '../constants/productSurfaces'
import { useUIStore } from '../store/ui'
import './ProductSurfaceStrip.css'

type StripTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

interface ProductSurfaceStripProps {
  surfaceId: string
  stateLabel: string
  setupLabel: string
  tone?: StripTone
  detail?: string
  primaryLabel?: string
  primaryToolId?: string
  onPrimary?: () => void
}

export function ProductSurfaceStrip({
  surfaceId,
  stateLabel,
  setupLabel,
  tone = 'neutral',
  detail,
  primaryLabel,
  primaryToolId,
  onPrimary,
}: ProductSurfaceStripProps) {
  const surface = getProductSurface(surfaceId)
  const openWorkspaceTool = useUIStore((state) => state.openWorkspaceTool)
  const setIntegrationCommandSelectionId = useUIStore((state) => state.setIntegrationCommandSelectionId)
  const activeWorkspaceToolId = useUIStore((state) => state.activeWorkspaceToolId)
  const dashboardTabActive = useUIStore((state) => state.dashboardTabActive)
  const browserTabActive = useUIStore((state) => state.browserTabActive)
  const drawerOpen = useUIStore((state) => state.drawerOpen)
  const drawerTool = useUIStore((state) => state.drawerTool)

  if (!surface) return null

  const primaryTargetToolId = primaryToolId ?? surface.primaryAction.toolId
  const isPrimaryTargetActive = !onPrimary && (
    activeWorkspaceToolId === primaryTargetToolId ||
    (primaryTargetToolId === 'dashboard' && dashboardTabActive) ||
    (primaryTargetToolId === 'browser' && browserTabActive) ||
    (drawerOpen && drawerTool === primaryTargetToolId)
  )

  const openIntegration = () => {
    if (!surface.relatedIntegrationId) return
    setIntegrationCommandSelectionId(surface.relatedIntegrationId)
    openWorkspaceTool('integrations')
  }

  return (
    <div className={`product-surface-strip product-surface-strip--${tone}`}>
      <div className="product-surface-strip-copy">
        <span>Product surface</span>
        <strong>{surface.name}</strong>
        <p>{detail ?? surface.primaryAction.detail}</p>
      </div>
      <div className="product-surface-strip-state">
        <span>{stateLabel}</span>
        <span>{setupLabel}</span>
      </div>
      <div className="product-surface-strip-actions">
        {isPrimaryTargetActive ? (
          <span className="product-surface-strip-current" aria-current="page">Viewing</span>
        ) : (
          <button type="button" onClick={onPrimary ?? (() => openWorkspaceTool(primaryTargetToolId))}>
            {primaryLabel ?? surface.primaryAction.label}
          </button>
        )}
        {surface.relatedIntegrationId ? (
          <button type="button" onClick={openIntegration}>
            Integrations
          </button>
        ) : null}
      </div>
    </div>
  )
}
