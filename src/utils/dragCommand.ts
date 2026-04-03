export const DAEMON_COMMAND_MIME = 'application/x-daemon-command'

export function setupCommandDrag(e: React.DragEvent, command: string, _label: string) {
  e.dataTransfer.setData(DAEMON_COMMAND_MIME, command)
  e.dataTransfer.setData('text/plain', command)
  e.dataTransfer.effectAllowed = 'copy'

  const ghost = document.createElement('div')
  ghost.textContent = command
  ghost.style.cssText =
    'position:fixed;top:-1000px;left:-1000px;font-family:monospace;font-size:11px;' +
    'background:#1a1a1a;color:#3ecf8e;border:1px solid rgba(62,207,142,0.4);' +
    'border-radius:4px;padding:2px 8px;white-space:nowrap;'
  document.body.appendChild(ghost)
  e.dataTransfer.setDragImage(ghost, 0, 0)
  ;(e.target as HTMLElement & { __dragGhost?: HTMLElement }).__dragGhost = ghost
}

export function cleanupDragGhost(e: React.DragEvent) {
  const target = e.target as HTMLElement & { __dragGhost?: HTMLElement }
  if (target.__dragGhost) {
    target.__dragGhost.remove()
    delete target.__dragGhost
  }
}

export function getCommandFromDrop(e: React.DragEvent): string | null {
  return e.dataTransfer.getData(DAEMON_COMMAND_MIME) || null
}
