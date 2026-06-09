import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Renders ARIA reply markdown into real HTML nodes (headings, bold, lists,
 * inline code) so raw `*`/`#`/`-` never reach the screen. Styling lives in
 * AgentWorkbench.css scoped under `.agent-tr-md`. Raw HTML is intentionally
 * NOT enabled (no rehype-raw) — model output can't inject markup.
 */
export function AriaMarkdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={['agent-tr-md', className].filter(Boolean).join(' ')}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  )
}
