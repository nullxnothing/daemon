import { describe, expect, it } from 'vitest'
import {
  readRightSidebarWidgetConfig,
  RIGHT_SIDEBAR_WIDGETS,
} from '../../src/panels/RightPanel/sidebarAgentWidgetConfig'

describe('Right sidebar widget config', () => {
  it('registers Zauth as a configurable side panel', () => {
    expect(RIGHT_SIDEBAR_WIDGETS).toContainEqual({
      id: 'zauth',
      name: 'Zauth',
      description: 'x402 Database and Provider Hub shortcuts in the right sidebar.',
    })
  })

  it('normalizes default visibility for the Zauth widget', () => {
    expect(readRightSidebarWidgetConfig().enabled.zauth).toBe(false)
  })
})
