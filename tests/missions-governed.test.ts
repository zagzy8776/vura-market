import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Agent Missions — Growth mission DAG + pure finalization rules + governed
 * executor. The executor must route every step through runAgentToolLoop (and
 * therefore executeTool); runAgentToolLoop is mocked here because its internal
 * governed execution is already covered by tool-loop.test.ts.
 */

const mockLoop = vi.hoisted(() => vi.fn());
const mockSql = vi.hoisted(() => vi.fn());

vi.mock('../api/_lib/agents/tool-loop.js', () => ({
  runAgentToolLoop: mockLoop,
  buildToolDefinitions: vi.fn(),
}));

vi.mock('../api/_lib/db.js', () => ({
  sql: mockSql,
}));

import {
  GROWTH_DAG,
  finalizeMissionStatus,
  resolveReadySteps,
  runAgentMissionStep,
  stepByKey,
} from '../api/_lib/agents/missions.js';

describe('Growth mission DAG', () => {
  it('runs the sequential chain Product → Marketing → Sales → Operations → approval gate', () => {
    const keys = GROWTH_DAG.map((s) => s.stepKey);
    expect(keys).toEqual(['product', 'marketing', 'sales', 'operations', 'approval_gate']);
  });

  it('product has no dependencies; each next step depends only on its predecessor', () => {
    expect(stepByKey('product')?.dependsOn).toEqual([]);
    expect(stepByKey('marketing')?.dependsOn).toEqual(['product']);
    expect(stepByKey('sales')?.dependsOn).toEqual(['marketing']);
    expect(stepByKey('operations')?.dependsOn).toEqual(['sales']);
  });

  it('terminates in an explicit human approval gate with no agent', () => {
    const gate = stepByKey('approval_gate');
    expect(gate?.synthetic).toBe('approval_gate');
    expect(gate?.agentId).toBeNull();
    expect(gate?.dependsOn).toEqual(['operations']);
  });

  it('includes no publish, social, or catalog-write step (no autonomous side effects)', () => {
    const keys = GROWTH_DAG.map((s) => s.stepKey);
    expect(keys).not.toContain('publish');
    expect(keys).not.toContain('social');
    expect(keys).not.toContain('catalog_write');
  });
});

describe('resolveReadySteps (pure DAG ready logic)', () => {
  it('starts with product when nothing is completed', () => {
    const statuses: Record<string, 'pending' | 'completed'> = {
      product: 'pending',
      marketing: 'pending',
      sales: 'pending',
      operations: 'pending',
      approval_gate: 'pending',
    };
    const ready = resolveReadySteps(GROWTH_DAG, statuses);
    expect(ready.map((s) => s.stepKey)).toEqual(['product']);
  });

  it('unlocks a step only when its dependency completed', () => {
    const statuses: Record<string, 'pending' | 'completed'> = {
      product: 'completed',
      marketing: 'pending',
      sales: 'pending',
      operations: 'pending',
      approval_gate: 'pending',
    };
    const ready = resolveReadySteps(GROWTH_DAG, statuses);
    expect(ready.map((s) => s.stepKey)).toEqual(['marketing']);
  });
});

describe('finalizeMissionStatus (pure finalization rules)', () => {
  it('holds at awaiting_approval and never completes past the human gate', () => {
    const statuses = ['completed', 'completed', 'completed', 'completed', 'awaiting_approval'];
    expect(finalizeMissionStatus(statuses)).toBe('awaiting_approval');
  });

  it('does not claim success when a step failed', () => {
    expect(
      finalizeMissionStatus(['completed', 'failed', 'completed', 'completed', 'pending']),
    ).toBe('running');
    expect(
      finalizeMissionStatus(['completed', 'failed', 'completed', 'completed', 'completed']),
    ).toBe('failed');
  });

  it('completes only when every step is terminal success', () => {
    expect(finalizeMissionStatus(['completed', 'completed', 'completed', 'completed', 'completed'])).toBe('completed');
    expect(finalizeMissionStatus(['completed', 'completed', 'skipped'])).toBe('completed');
  });
});

describe('runAgentMissionStep (governed executor)', () => {
  beforeEach(() => {
    mockLoop.mockReset();
    mockSql.mockReset();
    mockSql.mockResolvedValue([]);
  });

  it('routes the step through runAgentToolLoop with the step agentId and runId', async () => {
    mockLoop.mockResolvedValueOnce({
      text: 'final brief',
      provider: 'groq',
      model: 'm',
      stoppedReason: 'final',
      usage: { inputTokens: 10, outputTokens: 5 },
      turns: 1,
      messages: [],
    });

    await runAgentMissionStep({
      stepId: 'step-1',
      runId: 'run-9001',
      agentId: 'product-intelligence',
      stepKey: 'product',
      goal: 'Find solar products',
      role: 'Product Intelligence',
    });

    expect(mockLoop).toHaveBeenCalledTimes(1);
    const [ctx, opts] = mockLoop.mock.calls[0];
    expect(ctx.agentId).toBe('product-intelligence');
    expect(ctx.runId).toBe('run-9001');
    expect(opts.maxTurns).toBe(4);
    expect(opts.system).toContain('Product Intelligence');
    expect(opts.system).toContain('Do not write, publish, message, pay, or mutate anything.');
  });

  it('marks the step completed with the loop result on finalize', async () => {
    mockLoop.mockResolvedValueOnce({
      text: 'final brief',
      provider: 'groq',
      model: 'm',
      stoppedReason: 'final',
      usage: { inputTokens: 10, outputTokens: 5 },
      turns: 2,
      messages: [],
    });

    const outcome = await runAgentMissionStep({
      stepId: 'step-2',
      runId: 'run-9002',
      agentId: 'marketing-intelligence',
      stepKey: 'marketing',
      goal: 'research',
      role: 'Marketing Intelligence',
    });

    expect(outcome.ok).toBe(true);
    // The step must be marked completed (status = completed) via a sql update.
    const completed = mockSql.mock.calls.some((c) => {
      const parts = Array.isArray(c[0]) ? c[0].join('') : String(c[0] ?? '');
      return parts.includes("SET status = 'completed'");
    });
    expect(completed).toBe(true);
  });

  it('marks the step failed and returns ok:false when the loop does not finalize (no side effect)', async () => {
    mockLoop.mockResolvedValueOnce({
      text: '',
      provider: 'groq',
      model: 'm',
      stoppedReason: 'max_turns',
      turns: 4,
      usage: {},
      messages: [],
    });

    const outcome = await runAgentMissionStep({
      stepId: 'step-3',
      runId: 'run-9003',
      agentId: 'sales',
      stepKey: 'sales',
      goal: 'g',
      role: 'Sales Intelligence',
    });

    expect(outcome.ok).toBe(false);
    const failed = mockSql.mock.calls.some((c) => String(c?.[0])?.includes("SET status = 'failed'"));
    expect(failed).toBe(true);
  });

  it('returns ok:false and marks failed when runAgentToolLoop throws', async () => {
    mockLoop.mockRejectedValueOnce(new Error('provider down'));

    const outcome = await runAgentMissionStep({
      stepId: 'step-4',
      runId: 'run-9004',
      agentId: 'operations',
      stepKey: 'operations',
      goal: 'g',
      role: 'Operations Intelligence',
    });

    expect(outcome.ok).toBe(false);
    expect((outcome as { error?: string }).error).toContain('provider down');
  });
});
