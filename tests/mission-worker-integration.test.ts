import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Part 4 — Mission / API / worker integration:
 *  - claimNextJob and recoverStaleLocks must never claim mission-owned
 *    agent_runs (they are advanced by the mission ticker) to prevent duplicate
 *    / cross execution.
 *  - recoverStaleMissionSteps resets stale steps to ready and supersedes the
 *    orphaned mission run (no orphans, no double-run).
 *  - tickAgentMissions reliably recovers then advances due missions.
 */

const mockSql = vi.hoisted(() => vi.fn());

vi.mock('../api/_lib/db.js', () => ({ sql: mockSql }));

import { claimNextJob, recoverStaleLocks } from '../api/_lib/agents/job-queue.js';
import { recoverStaleMissionSteps, tickAgentMissions } from '../api/_lib/agents/missions.js';

/** True if any part of a tagged-template call (parts + params) contains needle. */
function callHas(call: unknown[], needle: string): boolean {
  return JSON.stringify(call).includes(needle);
}

describe('job-queue excludes mission-owned runs', () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it('recoverStaleLocks filters metadata.missionId in its WHERE', async () => {
    mockSql.mockResolvedValueOnce([{ id: 'run-1' }]);
    const n = await recoverStaleLocks(15);
    expect(n).toBe(1);
    const call = mockSql.mock.calls[0];
    expect(callHas(call, "metadata->>'missionId'")).toBe(true);
  });

  it('recoverStaleLocks excludes mission-owned runs (returns 0 when only a mission run is stale)', async () => {
    mockSql.mockResolvedValueOnce([]);
    const n = await recoverStaleLocks(15);
    expect(n).toBe(0);
  });

  it('claimNextJob filters mission-owned runs from its candidate select', async () => {
    // no candidates -> returns null
    mockSql.mockResolvedValueOnce([]);
    const none = await claimNextJob('worker-1');
    expect(none).toBeNull();
    const call = mockSql.mock.calls[0];
    expect(callHas(call, "metadata->>'missionId'")).toBe(true);
  });

  it('claimNextJob claims a non-mission queued run normally', async () => {
    mockSql
      .mockResolvedValueOnce([{ id: 'run-2' }]) // candidate
      .mockResolvedValueOnce([
        {
          id: 'run-2',
          agent_id: 'sales',
          task: 'T',
          input: {},
          attempts: 1,
          max_attempts: 3,
          metadata: {},
        },
      ]); // claim RETURNING
    const job = await claimNextJob('worker-1');
    expect(job?.runId).toBe('run-2');
    expect(job?.agentId).toBe('sales');
  });
});

describe('mission worker recovery', () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it('recoverStaleMissionSteps resets stale steps and supersedes the orphaned mission run', async () => {
    mockSql
      .mockResolvedValueOnce([{ id: 'step-s', mission_id: 'm-9', step_key: 'marketing' }]) // stale step
      .mockResolvedValueOnce([]); // orphan supersede update

    const n = await recoverStaleMissionSteps(15);
    expect(n).toBe(1);
    // First call resets the step to ready (not failed).
    const stepCall = mockSql.mock.calls[0];
    expect(callHas(stepCall, 'UPDATE agent_mission_steps')).toBe(true);
    expect(callHas(stepCall, "SET status = 'ready'")).toBe(true);
    // Second call marks the superseded mission run failed.
    const runCall = mockSql.mock.calls[1];
    expect(callHas(runCall, 'UPDATE agent_runs')).toBe(true);
    expect(callHas(runCall, "metadata->>'missionId'")).toBe(true);
  });

  it('tickAgentMissions recovers then advances a due mission (running path, no crash)', async () => {
    mockSql.mockImplementation(async (parts: string[]) => {
      const s = parts.join('');
      // recover step: no stale steps
      if (s.includes('UPDATE agent_mission_steps') && s.includes('RETURNING id, mission_id')) return [];
      // orphan supersede
      if (s.includes('UPDATE agent_runs')) return [];
      // due missions
      if (s.includes('SELECT id FROM agent_missions') && s.includes('WHERE status IN')) return [{ id: 'm-1' }];
      // tickGrowthMission queries
      if (s.includes('FROM agent_missions WHERE id')) return [{ id: 'm-1', goal: 'G', correlation_id: 'C', status: 'running' }];
      if (s.includes('FROM agent_mission_steps') && s.includes('attempts')) return [];
      if (s.includes('SELECT status FROM agent_mission_steps')) return [];
      if (s.includes('UPDATE agent_mission_steps') && s.includes('RETURNING id')) return [];
      return [];
    });

    const out = await tickAgentMissions(3);
    expect(out.ticks).toHaveLength(1);
    expect(out.ticks[0].missionId).toBe('m-1');
  });

  it('tickAgentMissions never advances an awaiting_approval mission (gate preserved)', async () => {
    mockSql.mockImplementation(async (parts: string[]) => {
      const s = parts.join('');
      if (s.includes('RETURNING id, mission_id')) return [];
      if (s.includes('UPDATE agent_runs')) return [];
      // only an awaiting_approval mission exists, so no queued/running due rows
      if (s.includes('SELECT id FROM agent_missions') && s.includes('WHERE status IN')) return [];
      return [];
    });
    const out = await tickAgentMissions(3);
    expect(out.ticks).toHaveLength(0);
    // awaiting_approval stays put: no tick cropped it to completed.
    expect(mockSql.mock.calls.some((c) => callHas(c, "SET status = 'completed'"))).toBe(false);
  });
});
