import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ResourceManager } from '../../electron/services/ResourceManager';

// Suppress console.warn for these tests
vi.stubGlobal('console', {
  warn: () => {},
  log: () => {},
  error: () => {},
});

import { vi } from 'vitest';

describe('ResourceManager', () => {
  beforeEach(() => {
    ResourceManager.reset();
  });

  it('should track resources', () => {
    const resource = {
      id: 'res-1',
      type: 'terminal' as const,
      cleanup: async () => {},
      lastActivity: Date.now(),
    };

    const id = ResourceManager.track(resource);
    expect(id).toBe('res-1');
    expect(ResourceManager.getCount()).toBe(1);
  });

  it('should untrack resources', () => {
    const resource = {
      id: 'res-1',
      type: 'terminal' as const,
      cleanup: async () => {},
      lastActivity: Date.now(),
    };

    ResourceManager.track(resource);
    expect(ResourceManager.getCount()).toBe(1);

    ResourceManager.untrack('res-1');
    expect(ResourceManager.getCount()).toBe(0);
  });

  it('should cleanup specific resource', async () => {
    let cleaned = false;
    const resource = {
      id: 'res-1',
      type: 'terminal' as const,
      cleanup: async () => {
        cleaned = true;
      },
      lastActivity: Date.now(),
    };

    ResourceManager.track(resource);
    await ResourceManager.cleanup('res-1');

    expect(cleaned).toBe(true);
    expect(ResourceManager.getCount()).toBe(0);
  });

  it('should cleanup by type', async () => {
    let terminal1Cleaned = false;
    let terminal2Cleaned = false;
    let connectionCleaned = false;

    ResourceManager.track({
      id: 'terminal-1',
      type: 'terminal',
      cleanup: async () => {
        terminal1Cleaned = true;
      },
      lastActivity: Date.now(),
    });

    ResourceManager.track({
      id: 'terminal-2',
      type: 'terminal',
      cleanup: async () => {
        terminal2Cleaned = true;
      },
      lastActivity: Date.now(),
    });

    ResourceManager.track({
      id: 'conn-1',
      type: 'connection',
      cleanup: async () => {
        connectionCleaned = true;
      },
      lastActivity: Date.now(),
    });

    await ResourceManager.cleanupType('terminal');

    expect(terminal1Cleaned).toBe(true);
    expect(terminal2Cleaned).toBe(true);
    expect(connectionCleaned).toBe(false);
    expect(ResourceManager.getCount()).toBe(1);
  });

  it('should get resource stats', () => {
    ResourceManager.track({
      id: 'terminal-1',
      type: 'terminal',
      cleanup: async () => {},
      lastActivity: Date.now(),
    });

    ResourceManager.track({
      id: 'terminal-2',
      type: 'terminal',
      cleanup: async () => {},
      lastActivity: Date.now(),
    });

    ResourceManager.track({
      id: 'conn-1',
      type: 'connection',
      cleanup: async () => {},
      lastActivity: Date.now(),
    });

    const stats = ResourceManager.getStats();
    expect(stats.terminal).toBe(2);
    expect(stats.connection).toBe(1);
  });
});
