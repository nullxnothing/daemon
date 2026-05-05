/**
 * SagaOrchestrator: Transaction-like semantics for multi-step operations
 * Handles saga pattern with compensation logic for rollback
 */

import { LogService } from './LogService'

export interface SagaStep<T = any> {
  name: string;
  execute: () => Promise<T>;
  compensate?: (result: T) => Promise<void>;
  onError?: (error: Error, result: T | undefined) => Promise<void>;
}

export interface SagaDefinition {
  id: string;
  name: string;
  steps: SagaStep[];
  idempotencyKey?: string;
  timeout?: number;
}

export interface SagaExecution {
  sagaId: string;
  name: string;
  status: 'pending' | 'executing' | 'completed' | 'compensating' | 'failed';
  currentStep: number;
  results: any[];
  errors: Array<{ step: string; error: string }>;
  startedAt: number;
  completedAt?: number;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

class SagaOrchestratorImpl {
  private executions: Map<string, SagaExecution> = new Map();
  private idempotencyCache: Map<string, SagaExecution> = new Map();
  private completedSagas: SagaExecution[] = [];

  /**
   * Execute a saga with automatic compensation on failure
   */
  async execute(definition: SagaDefinition): Promise<SagaExecution> {
    // Check idempotency: if same key already executed successfully, return cached result
    if (definition.idempotencyKey) {
      const cached = this.idempotencyCache.get(
        definition.idempotencyKey,
      );
      if (cached && cached.status === 'completed') {
        LogService.info('Saga', `Returning cached result for idempotencyKey: ${definition.idempotencyKey}`);
        return cached;
      }
    }

    const execution: SagaExecution = {
      sagaId: definition.id,
      name: definition.name,
      status: 'pending',
      currentStep: 0,
      results: [],
      errors: [],
      startedAt: Date.now(),
    };

    this.executions.set(definition.id, execution);

    try {
      execution.status = 'executing';

      // Execute all steps forward
      for (let i = 0; i < definition.steps.length; i++) {
        const step = definition.steps[i];
        execution.currentStep = i;

        try {
          LogService.info('Saga', `${definition.name} executing step ${i + 1}/${definition.steps.length}: ${step.name}`);

          const result = await this.executeWithTimeout(
            step.execute(),
            definition.timeout || 30000,
          );
          execution.results.push(result);
        } catch (error) {
          const normalizedError = toError(error);
          const errorMsg = normalizedError.message;
          execution.errors.push({
            step: step.name,
            error: errorMsg,
          });

          LogService.error('Saga', `${definition.name} step failed: ${step.name}`, normalizedError);

          // Call error handler if provided
          if (step.onError) {
            try {
              await step.onError(
                normalizedError,
                execution.results[i],
              );
            } catch (handlerError) {
              LogService.error('Saga', `${definition.name} error handler failed`, toError(handlerError));
            }
          }

          // Trigger compensation (rollback)
          await this.compensate(definition, execution, i - 1);
          execution.status = 'failed';
          execution.completedAt = Date.now();

          throw new Error(
            `Saga ${definition.name} failed at step ${step.name}: ${errorMsg}`,
          );
        }
      }

      execution.status = 'completed';
      execution.completedAt = Date.now();

      // Cache successful saga execution
      if (definition.idempotencyKey) {
        this.idempotencyCache.set(definition.idempotencyKey, execution);
      }

      this.completedSagas.push(execution);
      this.executions.delete(definition.id);

      LogService.info('Saga', `${definition.name} completed successfully in ${Date.now() - execution.startedAt}ms`);

      return execution;
    } catch (error) {
      execution.status = 'failed';
      execution.completedAt = Date.now();
      this.completedSagas.push(execution);
      this.executions.delete(definition.id);
      throw error;
    }
  }

  /**
   * Compensate (rollback) a saga from a given step backwards
   */
  private async compensate(
    definition: SagaDefinition,
    execution: SagaExecution,
    lastSuccessfulStep: number,
  ): Promise<void> {
    if (lastSuccessfulStep < 0) return;

    execution.status = 'compensating';

    LogService.info('Saga', `${definition.name} compensating from step ${lastSuccessfulStep}`);

    // Rollback in reverse order
    for (let i = lastSuccessfulStep; i >= 0; i--) {
      const step = definition.steps[i];
      const result = execution.results[i];

      if (!step.compensate) continue;

      try {
        LogService.info('Saga', `${definition.name} compensating step ${i + 1}: ${step.name}`);
        await this.executeWithTimeout(
          step.compensate(result),
          definition.timeout || 30000,
        );
      } catch (error) {
        LogService.error('Saga', `${definition.name} compensation failed for step ${step.name}`, toError(error));
        // Continue compensating even if one step fails
      }
    }
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | null = null;

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error(`Operation timeout after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  /**
   * Get execution status
   */
  getStatus(sagaId: string): SagaExecution | undefined {
    return this.executions.get(sagaId);
  }

  /**
   * Get historical execution
   */
  getHistory(sagaId: string): SagaExecution | undefined {
    return this.completedSagas.find((s) => s.sagaId === sagaId);
  }

  /**
   * Clear old executions from history (keep last N)
   */
  pruneHistory(keepCount: number = 100): void {
    if (this.completedSagas.length > keepCount) {
      this.completedSagas = this.completedSagas.slice(-keepCount);
    }
  }

  /**
   * Get all active executions
   */
  getActive(): SagaExecution[] {
    return Array.from(this.executions.values());
  }

  /**
   * Wait for a saga to complete (polling)
   */
  async waitFor(
    sagaId: string,
    timeoutMs: number = 60000,
  ): Promise<SagaExecution> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const execution = this.executions.get(sagaId);

      if (!execution) {
        // Check completed sagas
        const completed = this.completedSagas.find(
          (s) => s.sagaId === sagaId,
        );
        if (completed) {
          return completed;
        }
      }

      if (
        execution &&
        (execution.status === 'completed' || execution.status === 'failed')
      ) {
        return execution;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(
      `Timeout waiting for saga ${sagaId} after ${timeoutMs}ms`,
    );
  }

  /**
   * Cancel a saga (prevent further steps)
   */
  cancel(sagaId: string): void {
    const execution = this.executions.get(sagaId);
    if (execution && execution.status === 'pending') {
      execution.status = 'failed';
      execution.errors.push({
        step: 'saga',
        error: 'Cancelled by user',
      });
      this.executions.delete(sagaId);
    }
  }
}

export const SagaOrchestrator = new SagaOrchestratorImpl();
