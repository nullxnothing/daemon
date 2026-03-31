/**
 * ResourceManager: Centralized lifecycle management for long-lived resources
 * Ensures cleanup on process exit, crash recovery, and memory efficiency
 */

export interface ManagedResource {
  id: string;
  type: 'terminal' | 'watcher' | 'connection' | 'process' | 'other';
  cleanup: () => Promise<void> | void;
  lastActivity: number;
}

class ResourceManagerImpl {
  private resources: Map<string, ManagedResource> = new Map();
  private resourcesByType: Map<string, Set<string>> = new Map();
  private cleanupInterval: NodeJS.Timer | null = null;
  private isShuttingDown = false;

  constructor() {
    this.setupCleanupTimer();
    this.setupProcessHooks();
  }

  /**
   * Register a new resource for lifecycle management
   */
  track(resource: ManagedResource): string {
    this.resources.set(resource.id, resource);

    if (!this.resourcesByType.has(resource.type)) {
      this.resourcesByType.set(resource.type, new Set());
    }
    this.resourcesByType.get(resource.type)!.add(resource.id);

    return resource.id;
  }

  /**
   * Unregister a resource (call when resource is manually cleaned up)
   */
  untrack(resourceId: string): void {
    const resource = this.resources.get(resourceId);
    if (resource) {
      this.resourcesByType
        .get(resource.type)
        ?.delete(resourceId);
      this.resources.delete(resourceId);
    }
  }

  /**
   * Cleanup a specific resource
   */
  async cleanup(resourceId: string): Promise<void> {
    const resource = this.resources.get(resourceId);
    if (!resource) return;

    try {
      await resource.cleanup();
    } catch (error) {
      console.error(
        `Failed to cleanup resource ${resourceId}:`,
        error,
      );
    } finally {
      this.untrack(resourceId);
    }
  }

  /**
   * Cleanup all resources of a specific type
   */
  async cleanupType(type: ManagedResource['type']): Promise<void> {
    const resourceIds = Array.from(
      this.resourcesByType.get(type) || [],
    );
    await Promise.all(
      resourceIds.map((id) => this.cleanup(id)),
    );
  }

  /**
   * Cleanup all resources
   */
  async cleanupAll(): Promise<void> {
    const resourceIds = Array.from(this.resources.keys());
    await Promise.all(
      resourceIds.map((id) => this.cleanup(id)),
    );
  }

  /**
   * Get active resources of a type
   */
  getActive(type?: ManagedResource['type']): ManagedResource[] {
    if (type) {
      const ids = this.resourcesByType.get(type) || new Set();
      return Array.from(ids)
        .map((id) => this.resources.get(id)!)
        .filter(Boolean);
    }

    return Array.from(this.resources.values());
  }

  /**
   * Get resource count
   */
  getStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [type, ids] of this.resourcesByType.entries()) {
      stats[type] = ids.size;
    }
    return stats;
  }

  /**
   * Check for stale resources and clean them up
   * (resources inactive for > timeoutMs)
   */
  async cleanupStale(timeoutMs: number = 30 * 60 * 1000): Promise<void> {
    const now = Date.now();
    const staleIds: string[] = [];

    for (const [id, resource] of this.resources.entries()) {
      if (now - resource.lastActivity > timeoutMs) {
        staleIds.push(id);
      }
    }

    for (const id of staleIds) {
      try {
        await this.cleanup(id);
      } catch (error) {
        console.warn(`Failed to cleanup stale resource ${id}:`, error);
      }
    }
  }

  /**
   * Mark a resource as active (update lastActivity timestamp)
   */
  touch(resourceId: string): void {
    const resource = this.resources.get(resourceId);
    if (resource) {
      resource.lastActivity = Date.now();
    }
  }

  /**
   * Setup periodic cleanup of stale resources (every 5 minutes)
   */
  private setupCleanupTimer(): void {
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupStale().catch((err) =>
          console.error('Stale resource cleanup failed:', err),
        );
      },
      5 * 60 * 1000,
    );

    // Allow timer to not block process exit
    if (this.cleanupInterval && typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Setup process shutdown hooks to clean all resources
   */
  private setupProcessHooks(): void {
    const shutdown = async () => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval as any);
      }

      console.log('ResourceManager: Cleaning up all resources...');
      await this.cleanupAll();
      console.log('ResourceManager: Cleanup complete');
    };

    // Handle graceful shutdown signals
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error('Uncaught exception:', error);
      await shutdown();
      process.exit(1);
    });
  }

  /**
   * Get total active resources
   */
  getCount(): number {
    return this.resources.size;
  }

  /**
   * Force reset (for testing)
   */
  reset(): void {
    this.resources.clear();
    this.resourcesByType.clear();
  }
}

export const ResourceManager = new ResourceManagerImpl();
