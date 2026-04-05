import { ReactNode } from 'react'
import styles from './DocsPanel.module.css'

export function DocHeading({ children }: { children: ReactNode }) {
  return <h1 className={styles.docHeading}>{children}</h1>
}

export function DocSubheading({ children }: { children: ReactNode }) {
  return <p className={styles.docSubheading}>{children}</p>
}

export function H2({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className={styles.h2}>
      {children}
    </h2>
  )
}

export function H3({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h3 id={id} className={styles.h3}>
      {children}
    </h3>
  )
}

export function Paragraph({ children }: { children: ReactNode }) {
  return <p className={styles.paragraph}>{children}</p>
}

export function Code({ children }: { children: ReactNode }) {
  return <code className={styles.inlineCode}>{children}</code>
}

export function CodeBlock({ children, title }: { children: string; title?: string }) {
  return (
    <div className={styles.codeBlock}>
      {title && <div className={styles.codeBlockTitle}>{title}</div>}
      <pre className={styles.codeBlockPre}>
        <code className={styles.codeBlockCode}>{children}</code>
      </pre>
    </div>
  )
}

export function Table({
  headers,
  rows,
}: {
  headers: string[]
  rows: (string | ReactNode)[][]
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr className={styles.tableHead}>
            {headers.map((h) => (
              <th key={h} className={styles.th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={`${styles.tr} ${i % 2 === 0 ? styles.trEven : styles.trOdd}`}>
              {row.map((cell, j) => (
                <td key={j} className={styles.td}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.infoCard}>
      <h4 className={styles.infoCardTitle}>{title}</h4>
      <p className={styles.infoCardBody}>{children}</p>
    </div>
  )
}

export function CardGrid({ children }: { children: ReactNode }) {
  return <div className={styles.cardGrid}>{children}</div>
}

export function Hint({
  type = 'info',
  children,
}: {
  type?: 'info' | 'warning' | 'success'
  children: ReactNode
}) {
  const cls =
    type === 'warning'
      ? styles.hintWarning
      : type === 'success'
        ? styles.hintSuccess
        : styles.hintInfo
  return <div className={`${styles.hint} ${cls}`}>{children}</div>
}

export function List({ items }: { items: (string | ReactNode)[] }) {
  return (
    <ul className={styles.list}>
      {items.map((item, i) => (
        <li key={i} className={styles.listItem}>
          <span className={styles.listBullet} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export function Divider() {
  return <hr className={styles.divider} />
}
