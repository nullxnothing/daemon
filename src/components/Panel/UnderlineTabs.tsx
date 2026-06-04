import type { ReactNode } from 'react'
import styles from './UnderlineTabs.module.css'

export interface UnderlineTabItem<T extends string> {
  id: T
  label: ReactNode
  count?: ReactNode
  disabled?: boolean
}

interface UnderlineTabsProps<T extends string> {
  tabs: Array<UnderlineTabItem<T>>
  activeId: T
  onChange: (id: T) => void
  className?: string
}

export function UnderlineTabs<T extends string>({ tabs, activeId, onChange, className }: UnderlineTabsProps<T>) {
  const classes = [styles.tabs, className].filter(Boolean).join(' ')

  return (
    <div className={classes} role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.id === activeId
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={tab.disabled}
            className={[styles.tab, isActive ? styles.active : undefined].filter(Boolean).join(' ')}
            onClick={() => onChange(tab.id)}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined ? <span className={styles.count}>{tab.count}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
