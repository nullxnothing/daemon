import { useEffect, useState } from 'react'

export type ShellLayoutTier = 'desktop' | 'compact' | 'tablet' | 'small'

export interface ShellLayoutState {
  width: number
  tier: ShellLayoutTier
  isDesktop: boolean
  isCompact: boolean
  isTablet: boolean
  isSmall: boolean
}

function getTier(width: number): ShellLayoutTier {
  if (width >= 1280) return 'desktop'
  if (width >= 1024) return 'compact'
  if (width >= 840) return 'tablet'
  return 'small'
}

function getState(width: number): ShellLayoutState {
  const tier = getTier(width)
  return {
    width,
    tier,
    isDesktop: tier === 'desktop',
    isCompact: tier === 'compact',
    isTablet: tier === 'tablet',
    isSmall: tier === 'small',
  }
}

export function useShellLayout(): ShellLayoutState {
  const [state, setState] = useState(() => getState(window.innerWidth))

  useEffect(() => {
    const onResize = () => setState(getState(window.innerWidth))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return state
}
