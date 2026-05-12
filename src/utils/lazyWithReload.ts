import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

function isStaleChunkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('importing a module script failed') ||
    message.includes('error loading dynamically imported module')
  )
}

export function lazyWithReload<T extends ComponentType<any>>(
  cacheKey: string,
  loader: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    const retryKey = `daemon:lazy-reload:${cacheKey}`
    try {
      const module = await loader()
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(retryKey)
      }
      return module
    } catch (error) {
      const hasRetried = typeof window !== 'undefined' && window.sessionStorage.getItem(retryKey) === '1'

      if (!hasRetried && isStaleChunkError(error)) {
        window.sessionStorage.setItem(retryKey, '1')
        window.setTimeout(() => window.location.reload(), 0)
        throw error
      }

      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(retryKey)
      }
      throw error
    }
  })
}

export function lazyNamedWithReload<
  TComponent extends ComponentType<any>,
  TModule,
>(
  cacheKey: string,
  loader: () => Promise<TModule>,
  pick: (module: TModule) => TComponent,
): LazyExoticComponent<TComponent> {
  return lazyWithReload(cacheKey, async () => {
    const module = await loader()
    return { default: pick(module) }
  })
}
