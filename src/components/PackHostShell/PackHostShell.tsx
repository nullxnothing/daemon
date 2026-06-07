import type { ReactNode } from 'react'
import { PanelHeader } from '../Panel/PanelHeader'
import { UnderlineTabs, type UnderlineTabItem } from '../Panel/UnderlineTabs'
import { useUIStore } from '../../store/ui'
import styles from './PackHostShell.module.css'

interface PackHostShellProps<T extends string> {
  /** Eyebrow pack identity, e.g. "SOLANA PACK". */
  kicker: string
  title: string
  subtitle?: string
  /** Right-side header actions (Docs link, Refresh, etc.). */
  actions?: ReactNode
  tabs: Array<UnderlineTabItem<T>>
  activeId: T
  onChange: (id: T) => void
  /** Optional stable class on the host root (for styling / test hooks). */
  className?: string
  /** Active view content — scrolls under the sticky header + tab band. */
  children: ReactNode
}

/**
 * Shared chrome for capability-pack host panels: a sticky band of pack identity
 * (PanelHeader) + sub-tabs (UnderlineTabs) above a scrolling body. Every pack
 * host renders through this so the chrome is identical across packs.
 */
export function PackHostShell<T extends string>({
  kicker,
  title,
  subtitle,
  actions,
  tabs,
  activeId,
  onChange,
  className,
  children,
}: PackHostShellProps<T>) {
  const openWorkspaceTool = useUIStore((s) => s.openWorkspaceTool)

  return (
    <div className={className ? `${styles.host} ${className}` : styles.host}>
      <PanelHeader
        kicker={kicker}
        brandKicker
        title={title}
        subtitle={subtitle}
        actions={
          <>
            {actions}
            <button
              type="button"
              className={styles.managePacks}
              onClick={() => openWorkspaceTool('plugins')}
            >
              Manage packs
            </button>
          </>
        }
      />
      <UnderlineTabs
        tabs={tabs}
        activeId={activeId}
        onChange={onChange}
        className={styles.tabs}
      />
      <div className={styles.body}>{children}</div>
    </div>
  )
}
