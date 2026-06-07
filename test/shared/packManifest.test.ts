import { describe, it, expect } from 'vitest'
import {
  PACK_IPC_DOMAINS,
  CORE_PACK_IDS,
  defaultEnabledPacks,
  enabledIpcDomains,
} from '../../electron/shared/packManifest'

describe('packManifest — defaults', () => {
  it('defaults every pack to enabled', () => {
    const defaults = defaultEnabledPacks()
    for (const value of Object.values(defaults)) expect(value).toBe(true)
  })
})

describe('enabledIpcDomains', () => {
  it('includes all domains when every pack is enabled', () => {
    const domains = enabledIpcDomains(defaultEnabledPacks())
    expect(domains.has('wallet')).toBe(true)
    expect(domains.has('meterflow')).toBe(true)
    expect(domains.has('swarm')).toBe(true)
    expect(domains.has('launch')).toBe(true)
  })

  it('omits a disabled optional pack\'s domains', () => {
    const domains = enabledIpcDomains({ ...defaultEnabledPacks(), markets: false })
    // markets owns meterflow/idle/colosseum/signalhouse
    expect(domains.has('meterflow')).toBe(false)
    expect(domains.has('signalhouse')).toBe(false)
    // unrelated domains still present
    expect(domains.has('wallet')).toBe(true)
  })

  it('omits the agent pack\'s swarm domain when agent is off', () => {
    const domains = enabledIpcDomains({ ...defaultEnabledPacks(), agent: false })
    expect(domains.has('swarm')).toBe(false)
    expect(domains.has('agentStation')).toBe(false)
  })

  it('treats a missing pack key as enabled (default-on)', () => {
    // Empty map => nothing explicitly disabled => all domains present.
    const domains = enabledIpcDomains({})
    expect(domains.has('wallet')).toBe(true)
    expect(domains.has('meterflow')).toBe(true)
  })

  it('always includes core packs regardless of stored flags', () => {
    // guard is core and owns no domains, but the resolver must never drop core packs.
    for (const corePackId of CORE_PACK_IDS) {
      const domains = enabledIpcDomains({ [corePackId]: false })
      for (const domain of PACK_IPC_DOMAINS[corePackId]) {
        expect(domains.has(domain)).toBe(true)
      }
    }
  })
})
