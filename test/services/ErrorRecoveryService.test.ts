import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { ErrorRecoveryService, ErrorCategory, ErrorSeverity } from '../../electron/services/ErrorRecoveryService';

// Mock electron modules
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

vi.mock('../../electron/db/db', () => ({
  getDb: () => ({
    prepare: () => ({
      run: vi.fn(),
    }),
  }),
}));

describe('ErrorRecoveryService', () => {
  beforeEach(() => {
    ErrorRecoveryService.clearHistory();
  });

  describe('classifyError', () => {
    it('should classify network errors', () => {
      const error = new Error('ECONNREFUSED');
      const result = ErrorRecoveryService.classifyError(error);

      expect(result.category).toBe(ErrorCategory.NETWORK);
      expect(result.severity).toBe(ErrorSeverity.RECOVERABLE);
    });

    it('should classify database errors', () => {
      const error = new Error('database is locked');
      const result = ErrorRecoveryService.classifyError(error);

      expect(result.category).toBe(ErrorCategory.DATABASE);
      expect(result.severity).toBe(ErrorSeverity.RECOVERABLE);
    });

    it('should classify permission errors', () => {
      const error = new Error('EACCES permission denied');
      const result = ErrorRecoveryService.classifyError(error);

      expect(result.category).toBe(ErrorCategory.PERMISSION);
      expect(result.severity).toBe(ErrorSeverity.DEGRADED);
    });
  });

  describe('withRecovery', () => {
    it('should succeed on first try', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await ErrorRecoveryService.withRecovery(
        fn,
        'test-op',
      );

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledOnce();
    });

    it('should retry on transient failure', async () => {
      let attempt = 0;
      const fn = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt < 2) {
          throw new Error('ECONNREFUSED');
        }
        return Promise.resolve('success');
      });

      const result = await ErrorRecoveryService.withRecovery(
        fn,
        'test-op',
      );

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should use fallback when max retries exceeded', async () => {
      const fn = vi
        .fn()
        .mockRejectedValue(new Error('ECONNREFUSED'));
      const fallback = vi.fn().mockResolvedValue('fallback');

      const result = await ErrorRecoveryService.withRecovery(
        fn,
        'test-op',
        {
          retry: { maxAttempts: 2, delayMs: 10, backoff: false },
          fallback,
        },
      );

      expect(result).toBe('fallback');
    });

    it('should throw on fatal error immediately', async () => {
      const fn = vi
        .fn()
        .mockRejectedValue(new Error('validation error'));

      await expect(
        ErrorRecoveryService.withRecovery(fn, 'test-op'),
      ).rejects.toThrow();

      expect(fn.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('error history', () => {
    it('should track error history', async () => {
      const fn = vi
        .fn()
        .mockRejectedValue(new Error('ECONNREFUSED'));

      try {
        await ErrorRecoveryService.withRecovery(fn, 'test-op');
      } catch {
        // Expected
      }

      const history = ErrorRecoveryService.getErrorHistory('test-op');
      expect(history.length).toBeGreaterThan(0);
    });
  });
});
