import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * tickGrowthMission — mission-level safety + reliability integration tests:
 *  - duplicate/concurrent tick protection (atomic ready->running claim via
 *    RETURNING id; a loser tick deletes its orphaned agent_runs and does NOT
 *    run the agent again)
 *  - bounded retry at the mission level (failure within max_attempts resets
 *    the step to ready and marks the run failed; a later tick re-runs it)
 *  - approval-gate preservation (re-ticking an awaiting_approval mission never
 *    completes it or escalates past the human gate)
 *
 * runAgentToolLoop is mocked (its governed execution is covered by
 * tool-loop.test.ts); tickGrowthMission is exercised end-to-end against a
 * scripted `sql` (db) mock.
 */

const mockLoop = vi.hoisted(() => vi.fn());
const mockSql = vi.hoisted(() => vi.fn());

vi.mock('../api/_lib/agents/tool-loop.js', () => ({
  runAgentToolLoop: mockLoop,
  buildToolDefinitions: vi.fn(),
}));

vi.mock('../api/_lib/db.js', () => ({ sql: mockSql }));

import { tickGrowthMission } from '../api/_lib/agents/missions.js';

/** True if any part of a tagged-template sql call (parts + params) contains needle. */
function callHas(call: unknown[], needle: string): boolean {
  return JSON.stringify(call).includes(needle);
}

const readyMarketingStep = {
  id: 'step-m',
  step_key: 'marketing',
  agent_id: 'marketing-intelligence',
  depends_on: ['product'],
  status: 'ready',
  input: '{}',
};

const completedRest = ['completed', 'completed', 'completed'].map((status) => ({ status }));

describe('tickGrowthMission integration safety', () => {
  beforeEach(() => {
    mockLoop.mockReset();
  });

  it('runs a ready agent step through the governed loop and marks its run completed', async () => {
    mockSql.mockImplementation(async (parts: string[]) => {
      const s = parts.join('');
      if (s.includes('FROM agent_missions WHERE id')) return [{ id: 'm-1', goal: 'Grow solar', correlation_id: 'CORR-1', status: 'running' }];
      if (s.includes('DELETE FROM agent_runs')) return [];
      if (s.includes('INSERT INTO agent_runs')) return [];
      if (s.includes('FROM agent_mission_steps') && s.includes('attempts')) return [readyMarketingStep];
      if (s.includes('SELECT status FROM agent_mission_steps')) return [...completedRest, { status: 'pending' }];
      if (s.includes('UPDATE agent_mission_steps') && s.includes('RETURNING id')) return [{ id: 'step-m' }];
      return [];
    });
    mockLoop.mockResolvedValueOnce({
      text: 'marketing brief',
      provider: 'groq',
      model: 'm',
      stoppedReason: 'final',
      usage: { inputTokens: 5, outputTokens: 3 },
      turns: 1,
      messages: [],
    });

    const out = await tickGrowthMission('m-1');
    expect(out.missionStatus).toBe('running');
    expect(mockLoop).toHaveBeenCalledTimes(1);
    const [ctx] = mockLoop.mock.calls[0];
    expect(ctx.agentId).toBe('marketing-intelligence');
    expect(ctx.runId).toBeTruthy();
    // A mission-derived agent_runs record was created and linked to the step.
    expect(mockSql.mock.calls.some((c) => callHas(c, 'INSERT INTO agent_runs'))).toBe(true);
    // The run was marked completed on success.
    expect(
      mockSql.mock.calls.some(
        (c) => callHas(c, 'UPDATE agent_runs SET status') && callHas(c, 'completed'),
      ),
    ).toBe(true);
  });

  it('protects against duplicate/concurrent ticks: only one tick runs the agent, loser deletes its orphaned run', async () => {
    const finalStatuses = [...completedRest, { status: 'pending' }];
    let claimCalls = 0;
    mockSql.mockImplementation(async (parts: string[]) => {
      const s = parts.join('');
      if (s.includes('FROM agent_missions WHERE id')) return [{ id: 'm-1', goal: 'g', correlation_id: 'CORR-1', status: 'running' }];
      if (s.includes('DELETE FROM agent_runs')) return [];
      if (s.includes('INSERT INTO agent_runs')) return [];
      if (s.includes('FROM agent_mission_steps') && s.includes('attempts')) return [readyMarketingStep];
      if (s.includes('SELECT status FROM agent_mission_steps')) return finalStatuses;
      if (s.includes('UPDATE agent_mission_steps') && s.includes('RETURNING id')) {
        claimCalls += 1;
        // tick 1 claims the step; tick 2 gets an empty claim (the row is already
        // 'running', so its UPDATE ... RETURNING id matches 0 rows).
        return claimCalls === 1 ? [{ id: 'step-m' }] : [];
      }
      return [];
    });
    mockLoop.mockResolvedValueOnce({
      text: 'brief', provider: 'groq', model: 'm', stoppedReason: 'final',
      usage: {}, turns: 1, messages: [],
    });

    await tickGrowthMission('m-1');
    await tickGrowthMission('m-1');

    // The winner ran once; the loser is skipped before touching the model.
    expect(mockLoop).toHaveBeenCalledTimes(1);
    // The loser deletes the agent_runs it created before discovering the claim lost.
    expect(mockSql.mock.calls.some((c) => callHas(c, 'DELETE FROM agent_runs'))).toBe(true);
  });

  it('retries a failed step on a later tick up to maxAttempts, then completes on success', async () => {
    const finalStatuses = [...completedRest, { status: 'pending' }];
    let attemptsState = 0;
    mockSql.mockImplementation(async (parts: string[]) => {
      const s = parts.join('');
      if (s.includes('UPDATE agent_mission_steps') && s.includes("SET status = 'running'") && s.includes('attempts = attempts + 1')) {
        attemptsState += 1;
        return [{ id: 'step-m' }];
      }
      if (s.includes('UPDATE agent_mission_steps') && s.includes('RETURNING id')) return [{ id: 'step-m' }];
      if (s.includes('FROM agent_mission_steps') && s.includes('attempts')) {
        return [{ ...readyMarketingStep, attempts: attemptsState, max_attempts: 3 }];
      }
      if (s.includes('FROM agent_missions WHERE id')) return [{ id: 'm-1', goal: 'g', correlation_id: 'CORR-1', status: 'running' }];
      if (s.includes('SELECT status FROM agent_mission_steps')) return finalStatuses;
      return [];
    });
    // tick 1: provider fails -> retry (attempts 1 < 3)
    mockLoop.mockRejectedValueOnce(new Error('provider timeout'));
    // tick 2: succeeds (attempts 2 < 3)
    mockLoop.mockResolvedValueOnce({
      text: 'brief', provider: 'groq', model: 'm', stoppedReason: 'final',
      usage: {}, turns: 1, messages: [],
    });

    const first = await tickGrowthMission('m-1');
    // step reset to ready -> mission stays running (not failed)
    expect(first.missionStatus).toBe('running');
    expect(mockSql.mock.calls.some((c) => callHas(c, "SET status = 'ready'"))).toBe(true);
    expect(
      mockSql.mock.calls.some(
        (c) => callHas(c, 'UPDATE agent_runs SET status') && callHas(c, 'failed'),
      ),
    ).toBe(true);

    const second = await tickGrowthMission('m-1');
    expect(second.missionStatus).toBe('running');
    // re-ran on the second tick -> two loop invocations total
    expect(mockLoop).toHaveBeenCalledTimes(2);
    expect(mockSql.mock.calls.some((c) => callHas(c, "SET status = 'completed'"))).toBe(true);
  });

  it('never completes past the approval gate on re-tick (awaiting_approval is terminal until human action)', async () => {
    mockSql.mockImplementation(async (parts: string[]) => {
      const s = parts.join('');
      if (s.includes('FROM agent_missions WHERE id')) return [{ id: 'm-1', goal: 'g', correlation_id: 'CORR-1', status: 'awaiting_approval' }];
      if (s.includes('FROM agent_mission_steps') && s.includes('attempts')) return [];
      if (s.includes('SELECT status FROM agent_mission_steps')) return [...completedRest, { status: 'awaiting_approval' }];
      return [];
    });
    mockLoop.mockResolvedValueOnce({ text: 'x', provider: 'groq', model: 'm', stoppedReason: 'final', usage: {}, turns: 1, messages: [] });

    const out = await tickGrowthMission('m-1');
    expect(out.missionStatus).toBe('awaiting_approval');
    // The model/agent is never invoked at/after the gate.
    expect(mockLoop).not.toHaveBeenCalled();
    // No sql that would complete the mission was issued.
    expect(
      mockSql.mock.calls.some((c) => callHas(c, 'UPDATE agent_missions SET status') && callHas(c, 'completed')),
    ).toBe(false);
  });
});
