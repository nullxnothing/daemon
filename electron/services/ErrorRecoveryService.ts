import { BrowserWindow } from 'electron';
import { getDb } from '../db/db';

/**
 * ErrorRecoveryService: Centralized error handling with recovery strategies
 * Handles classification, retry logic, and graceful degradation
 */

export enum ErrorSeverity {
  RECOVERABLE = 'recoverable',      // Can retry or continue
  DEGRADED = 'degraded',             // Feature partially broken
  FATAL = 'fatal',                  // Application must exit
}

export enum ErrorCategory {
  NETWORK = 'network',              // Network-related (timeout, DNS, etc)
  DATABASE = 'database',            // SQLite errors (locked, corrupt, etc)
  PROCESS = 'process',              // Terminal/subprocess failures
  PERMISSION = 'permission',        // File/OS permission denied
  VALIDATION = 'validation',        // Invalid input/state
  TIMEOUT = 'timeout',              // Operation exceeded time limit
  UNKNOWN = 'unknown',              // Unclassified
}

export interface ErrorContext {
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  originalError: Error;
  context?: Record<string, any>;
  retryCount?: number;
  maxRetries?: number;
}

export interface RecoveryStrategy {
  retry?: { maxAttempts: number; delayMs: number; backoff: boolean };
  fallback?: () => Promise<any>;
  notify?: boolean;
  log?: boolean;
}

class ErrorRecoveryServiceImpl {
  private errorHistory: Map<string, ErrorContext[]> = new Map();
  private recoveryHandlers: Map<ErrorCategory, RecoveryStrategy> = new Map();

  constructor() {
    this.setupDefaultStrategies();
  }

  /**
   * Classify error into category and severity
   */
  classifyError(error: Error, context?: Record<string, any>): ErrorContext {
    const message = error.message.toLowerCase();

    let category = ErrorCategory.UNKNOWN;
    let severity = ErrorSeverity.FATAL;

    // Network errors
    if (
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('timeout') ||
      message.includes('unreachable')
    ) {
      category = ErrorCategory.NETWORK;
      severity = ErrorSeverity.RECOVERABLE;
    }
    // Database errors
    else if (
      message.includes('database') ||
      message.includes('sqlite') ||
      message.includes('sql')
    ) {
      category = ErrorCategory.DATABASE;
      severity = message.includes('locked')
        ? ErrorSeverity.RECOVERABLE
        : ErrorSeverity.DEGRADED;
    }
    // Process errors
    else if (
      message.includes('enoent') ||
      message.includes('spawn') ||
      message.includes('process')
    ) {
      category = ErrorCategory.PROCESS;
      severity = ErrorSeverity.RECOVERABLE;
    }
    // Permission errors
    else if (
      message.includes('eacces') ||
      message.includes('eperm') ||
      message.includes('permission')
    ) {
      category = ErrorCategory.PERMISSION;
      severity = ErrorSeverity.DEGRADED;
    }
    // Validation errors
    else if (
      message.includes('validation') ||
      message.includes('invalid')
    ) {
      category = ErrorCategory.VALIDATION;
      severity = ErrorSeverity.RECOVERABLE;
    }
    // Timeout
    else if (message.includes('timeout')) {
      category = ErrorCategory.TIMEOUT;
      severity = ErrorSeverity.RECOVERABLE;
    }

    return {
      category,
      severity,
      message: error.message,
      originalError: error,
      context,
    };
  }

  /**
   * Execute operation with automatic retry and recovery
   */
  async withRecovery<T>(
    operation: () => Promise<T>,
    operationName: string,
    strategy?: RecoveryStrategy,
  ): Promise<T> {
    const defaultStrategy = this.recoveryHandlers.get(ErrorCategory.UNKNOWN);
    const effectiveStrategy = strategy || defaultStrategy || {};
    const maxRetries = effectiveStrategy.retry?.maxAttempts || 3;

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        const errorContext = this.classifyError(lastError, {
          operation: operationName,
          attempt,
          maxRetries,
        });

        this.recordError(operationName, errorContext);

        if (effectiveStrategy.log !== false) {
          this.logError(errorContext, operationName);
        }

        // Non-recoverable errors should fail immediately
        if (errorContext.severity === ErrorSeverity.FATAL) {
          throw errorContext.originalError;
        }

        // If this was the last attempt, throw
        if (attempt === maxRetries - 1) {
          if (effectiveStrategy.fallback) {
            try {
              return await effectiveStrategy.fallback();
            } catch (fallbackError) {
              throw errorContext.originalError;
            }
          }
          throw errorContext.originalError;
        }

        // Wait before retry with optional exponential backoff
        if (effectiveStrategy.retry?.backoff) {
          const delay =
            effectiveStrategy.retry.delayMs * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          await new Promise((resolve) =>
            setTimeout(resolve, effectiveStrategy.retry?.delayMs || 1000),
          );
        }

        attempt++;
      }
    }

    throw lastError || new Error(`Operation ${operationName} failed`);
  }

  /**
   * Record error in history for debugging
   */
  private recordError(operationName: string, context: ErrorContext): void {
    if (!this.errorHistory.has(operationName)) {
      this.errorHistory.set(operationName, []);
    }

    const history = this.errorHistory.get(operationName)!;
    history.push(context);

    // Keep only last 50 errors per operation
    if (history.length > 50) {
      history.shift();
    }

    // Also store in database for crash reports
    try {
      const db = getDb();
      db.prepare(
        `INSERT INTO error_logs (operation, category, severity, message, context, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        operationName,
        context.category,
        context.severity,
        context.message,
        JSON.stringify(context.context),
        Date.now(),
      );
    } catch {
      // If DB write fails, just skip persistence
    }
  }

  /**
   * Log error to console/file with context
   */
  private logError(context: ErrorContext, operationName: string): void {
    const logLevel =
      context.severity === ErrorSeverity.FATAL ? 'error' : 'warn';
    const prefix = `[${context.category.toUpperCase()}] ${operationName}`;

    console[logLevel as 'error' | 'warn'](
      `${prefix}: ${context.message}`,
      context.context,
    );
  }

  /**
   * Notify renderer of error if UI needs to update
   */
  notifyRenderer(context: ErrorContext, action?: string): void {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) {
      window.webContents.send('error:notify', {
        severity: context.severity,
        message: context.message,
        category: context.category,
        action,
      });
    }
  }

  /**
   * Setup default recovery strategies per error category
   */
  private setupDefaultStrategies(): void {
    this.recoveryHandlers.set(ErrorCategory.NETWORK, {
      retry: { maxAttempts: 3, delayMs: 2000, backoff: true },
      notify: true,
    });

    this.recoveryHandlers.set(ErrorCategory.DATABASE, {
      retry: { maxAttempts: 2, delayMs: 500, backoff: false },
      notify: false,
    });

    this.recoveryHandlers.set(ErrorCategory.PROCESS, {
      retry: { maxAttempts: 1, delayMs: 1000, backoff: false },
      notify: true,
    });

    this.recoveryHandlers.set(ErrorCategory.TIMEOUT, {
      retry: { maxAttempts: 2, delayMs: 5000, backoff: true },
      notify: true,
    });
  }

  /**
   * Get error history for a specific operation
   */
  getErrorHistory(operationName: string): ErrorContext[] {
    return this.errorHistory.get(operationName) || [];
  }

  /**
   * Clear error history
   */
  clearHistory(operationName?: string): void {
    if (operationName) {
      this.errorHistory.delete(operationName);
    } else {
      this.errorHistory.clear();
    }
  }
}

export const ErrorRecoveryService = new ErrorRecoveryServiceImpl();
