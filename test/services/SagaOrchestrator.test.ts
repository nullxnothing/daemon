import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SagaOrchestrator } from '../../electron/services/SagaOrchestrator';

describe('SagaOrchestrator', () => {
  beforeEach(() => {
    // Reset state between tests
  });

  it('should execute saga with all steps successful', async () => {
    const execution = await SagaOrchestrator.execute({
      id: 'saga-1',
      name: 'test-saga',
      steps: [
        {
          name: 'step-1',
          execute: async () => 'result-1',
        },
        {
          name: 'step-2',
          execute: async () => 'result-2',
        },
      ],
    });

    expect(execution.status).toBe('completed');
    expect(execution.results).toEqual(['result-1', 'result-2']);
    expect(execution.errors).toEqual([]);
  });

  it('should compensate on step failure', async () => {
    const step1Compensated = vi.fn();
    const step2Failed = vi.fn();

    const execution = await SagaOrchestrator.execute({
      id: 'saga-2',
      name: 'test-saga-failure',
      steps: [
        {
          name: 'step-1',
          execute: async () => 'result-1',
          compensate: step1Compensated,
        },
        {
          name: 'step-2',
          execute: step2Failed.mockRejectedValue(
            new Error('Step 2 failure'),
          ),
        },
      ],
    }).catch((err) => {
      return { error: err.message };
    });

    // Compensation should have been called
    expect(step1Compensated).toHaveBeenCalled();
  });

  it('should handle idempotent executions', async () => {
    const execute = vi.fn(async () => 'result');

    const execution1 = await SagaOrchestrator.execute({
      id: 'saga-3',
      name: 'idempotent-saga',
      idempotencyKey: 'key-123',
      steps: [
        {
          name: 'step-1',
          execute,
        },
      ],
    });

    const execution2 = await SagaOrchestrator.execute({
      id: 'saga-4',
      name: 'idempotent-saga-2',
      idempotencyKey: 'key-123',
      steps: [
        {
          name: 'step-1',
          execute,
        },
      ],
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(execution1.results).toEqual(execution2.results);
  });

  it('should timeout long-running operation', async () => {
    const execution = await SagaOrchestrator.execute({
      id: 'saga-5',
      name: 'timeout-saga',
      timeout: 100,
      steps: [
        {
          name: 'slow-step',
          execute: async () =>
            new Promise((resolve) =>
              setTimeout(() => resolve('done'), 5000),
            ),
        },
      ],
    }).catch((err) => {
      return err;
    });

    expect(execution).toHaveProperty('message');
  });

  it('should track active executions', async () => {
    const promise = SagaOrchestrator.execute({
      id: 'saga-6',
      name: 'tracking-saga',
      steps: [
        {
          name: 'step-1',
          execute: async () => {
            await new Promise((resolve) =>
              setTimeout(resolve, 100),
            );
            return 'done';
          },
        },
      ],
    });

    const active = SagaOrchestrator.getActive();
    expect(active.length).toBeGreaterThan(0);

    await promise;
  });
});
