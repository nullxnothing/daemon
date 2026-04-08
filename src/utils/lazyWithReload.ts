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
    try {
      return await loader()
    } catch (error) {
      const retryKey = `daemon:lazy-reload:${cacheKey}`
      const hasRetried = typeof window !== 'undefined' && window.sessionStorage.getItem(retryKey) === '1'

      if (!hasRetried && isStaleChunkError(error)) {
        window.sessionStorage.setItem(retryKey, '1')
        window.location.reload()
        return new Promise(() => undefined)
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
