const warnedKeys = new Set<string>()

function warnOnce(key: string, error: string): void {
  if (warnedKeys.has(key)) return
  warnedKeys.add(key)
  console.error(`[daemon-bridge] ${error}`)
}

function missingMethod(path: string): (...args: unknown[]) => unknown {
  return () => {
    const error = `Missing preload bridge method: ${path}`
    warnOnce(path, error)
    if (path.endsWith('.on') || /\.on[A-Z]/.test(path)) {
      return () => {}
    }
    return Promise.resolve({ ok: false, error })
  }
}

function namespaceProxy(name: string): Record<string, unknown> {
  return new Proxy({}, {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined
      const root = (window as unknown as { daemon?: Record<string, unknown> }).daemon
      const namespace = root?.[name]
      if (namespace && typeof namespace === 'object') {
        const value = (namespace as Record<string, unknown>)[prop]
        if (value !== undefined) {
          return typeof value === 'function' ? value.bind(namespace) : value
        }
      }
      return missingMethod(`daemon.${name}.${prop}`)
    },
  })
}

export const daemon = new Proxy({}, {
  get(_target, prop) {
    if (typeof prop !== 'string') return undefined
    const root = (window as unknown as { daemon?: Record<string, unknown> }).daemon
    if (root) {
      const value = root[prop]
      if (value !== undefined) {
        if (value && typeof value === 'object') return namespaceProxy(prop)
        return typeof value === 'function' ? value.bind(root) : value
      }
    }
    const error = `Missing preload bridge namespace: daemon.${prop}`
    warnOnce(`daemon.${prop}`, error)
    return namespaceProxy(prop)
  },
}) as unknown as Window['daemon']
