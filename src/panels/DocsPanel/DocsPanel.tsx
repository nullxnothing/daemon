import { useState, useRef, useEffect } from 'react'
import { docsConfig, getPrevNext } from './docs-config'
import { DOC_COMPONENTS } from './docs-content'
import styles from './DocsPanel.module.css'

export function DocsPanel() {
  const [activeSlug, setActiveSlug] = useState('introduction')
  const contentRef = useRef<HTMLDivElement>(null)

  const { prev, next } = getPrevNext(activeSlug)
  const DocComponent = DOC_COMPONENTS[activeSlug]

  const navigate = (slug: string) => {
    setActiveSlug(slug)
  }

  // Scroll content to top when slug changes
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0
    }
  }, [activeSlug])

  return (
    <div className={styles.panel}>
      {/* Sidebar */}
      <nav className={styles.sidebar}>
        {docsConfig.map((section) => (
          <div key={section.title} className={styles.sidebarSection}>
            <div className={styles.sidebarSectionTitle}>{section.title}</div>
            {section.items.map((item) => (
              <button
                key={item.slug}
                className={`${styles.sidebarItem} ${activeSlug === item.slug ? styles.sidebarItemActive : ''}`}
                onClick={() => navigate(item.slug)}
              >
                {item.title}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* Content */}
      <div className={styles.content} ref={contentRef}>
        {DocComponent ? <DocComponent /> : null}

        {/* Prev / Next pagination */}
        <div className={styles.pagination}>
          {prev ? (
            <button type="button" className={styles.paginationBtn} onClick={() => navigate(prev.slug)}>
              <span className={styles.paginationLabel}>Previous</span>
              <span className={styles.paginationTitle}>{prev.title}</span>
            </button>
          ) : (
            <span />
          )}
          {next ? (
            <button
              type="button"
              className={`${styles.paginationBtn} ${styles.paginationBtnNext}`}
              onClick={() => navigate(next.slug)}
            >
              <span className={styles.paginationLabel}>Next</span>
              <span className={styles.paginationTitle}>{next.title}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
