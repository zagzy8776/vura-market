import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Phase K — Engineering governance:
 * (a) analyzeEngineering must route ALL four health slices (failed, stuck,
 *     queued, notifications) through the governed executeTool -> runtime.read
 *     path, bound to the engineering agentId + owning runId.
 * (b) Rejects unauthorized agents at the real runtime.executeTool level.
 * (c) Tool failure must not crash the scan (audited, returns null).
 */

const execMock = vi.hoisted(() => vi.fn());
const sqlMock = vi.hoisted(() => vi.fn());

vi.mock('../api/_lib/agents/runtime.js', () => ({
  executeTool: execMock,
  getAgentPolicy: vi.fn(),
  listTools: vi.fn(),
  registerTool: vi.fn(),
  requestApproval: vi.fn(),
  runAgent: vi.fn(),
}));

import { analyzeEngineering } from '../api/_lib/agents/engineering-intelligence.js';

describe('analyzeEngineering routes health reads through governed runtime.read', () => {
  beforeEach(() => {
    execMock.mockReset();
  });

  it('calls executeTool four times with engineering + runId + closed scopes', async () => {
    execMock.mockResolvedValue({
      rows: [],
      total: 0,
      byAgent: {},
      count: 0,
      last24h: 0,
      critical24h: 0,
    });
    await analyzeEngineering({ agentId: 'engineering', runId: 'run-eng-1', task: 'health' });

    const calls = execMock.mock.calls;
    expect(calls).toHaveLength(4);
    for (const c of calls) {
      expect(c[0]).toBe('engineering'); // agentId
      expect(c[1]).toBe('run-eng-1'); // runId bound to owning run
    }
    const scopes = calls.map((c) => c[2]);
    expect(scopes.filter((s) => s === 'runtime.read')).toHaveLength(4);
    const scopeArgs = calls.map((c) => (c[3] as { scope?: string }).scope);
    expect(scopeArgs).toEqual(['runs.failed', 'runs.stuck', 'runs.queued', 'notifications']);
  });

  it('produces a Repeated agent failures incident when a failed agent repeats >=2x', async () => {
    let call = 0;
    execMock.mockImplementation(() => {
      call += 1;
      if (call === 1) {
        // runs.failed
        return {
          total: 3,
          byAgent: { operations: 3 },
          rows: [
            { id: 'a', agentId: 'operations', error: 'db down' },
            { id: 'b', agentId: 'operations', error: 'timeout' },
            { id: 'c', agentId: 'operations', error: 'timeout' },
          ],
        };
      }
      return { count: 0, last24h: 0, critical24h: 0, rows: [], total: 0, byAgent: {} };
    });

    const out = await analyzeEngineering({ agentId: 'engineering', runId: 'run-eng-2', task: 'health' });
    const failureIncident = out.incidents.find((i) => i.title.includes('Repeated agent failures'));
    expect(failureIncident).toBeDefined();
    expect(failureIncident!.affectedComponent).toBe('agent:operations');
    expect(failureIncident!.severity).toBe('medium');
  });

  it('stays nominal and does not crash when all reads return empty', async () => {
    execMock.mockResolvedValue({ rows: [], total: 0, byAgent: {}, count: 0, last24h: 0, critical24h: 0 });
    const out = await analyzeEngineering({ agentId: 'engineering', runId: 'run-eng-3', task: 'health' });
    expect(out.incidents).toHaveLength(1);
    expect(out.incidents[0].title).toBe('Engineering health nominal');
    expect(out.evidence.join(' ')).toContain('Notifications last 24h: 0');
  });

  it('does not crash if a health read throws (failure is audited, read returns null)', async () => {
    let call = 0;
    execMock.mockImplementation(() => {
      call += 1;
      if (call === 2) throw new Error('db down'); // runs.stuck fails
      return { rows: [], total: 0, byAgent: {}, count: 0, last24h: 0, critical24h: 0 };
    });
    const out = await analyzeEngineering({ agentId: 'engineering', runId: 'run-eng-4', task: 'health' });
    // Scan still completes nominally because the stuck read was null.
    expect(out.incidents).toHaveLength(1);
    expect(out.incidents[0].title).toBe('Engineering health nominal');
  });

  it('flags a queue backlog and stuck runs when present', async () => {
    let call = 0;
    execMock.mockImplementation(() => {
      call += 1;
      if (call === 2) return { count: 2, oldestLock: new Date().toISOString() }; // stuck
      if (call === 3) return { count: 30, backlog: true, nextDueAt: null }; // queued >20
      return { rows: [], total: 0, byAgent: {}, count: 0, last24h: 0, critical24h: 0 };
    });
    const out = await analyzeEngineering({ agentId: 'engineering', runId: 'run-eng-5', task: 'health' });
    const titles = out.incidents.map((i) => i.title);
    expect(titles).toContain('Stuck agent jobs detected');
    expect(titles).toContain('Agent queue backlog');
  });
});

describe('real runtime.executeTool policy for engineering / cross-agent isolation', () => {
  beforeEach(() => {
    sqlMock.mockReset();
    sqlMock.mockResolvedValue([]);
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('permits runtime.read for the engineering agent and records bound events', async () => {
    vi.doMock('../api/_lib/db.js', () => ({ sql: sqlMock, json: () => undefined }));
    const { executeTool } = await vi.importActual('../api/_lib/agents/runtime.js') as { executeTool: (a: string, r: string, n: string, i: unknown) => Promise<unknown> };
    const out = await executeTool('engineering', 'run-eng-r1', 'runtime.read', { scope: 'runs.queued' });
    expect(out).toBeDefined();
    const started = sqlMock.mock.calls.filter((c) => String(c[0]).includes('tool.started') && [...c].includes('run-eng-r1') && [...c].includes('runtime.read'));
    const completed = sqlMock.mock.calls.filter((c) => String(c[0]).includes('tool.completed'));
    expect(started).toHaveLength(1);
    expect(completed).toHaveLength(1);
  });

  it('rejects runtime.read for a non-engineering agent before writing any event', async () => {
    vi.doMock('../api/_lib/db.js', () => ({ sql: sqlMock, json: () => undefined }));
    const { executeTool } = await vi.importActual('../api/_lib/agents/runtime.js') as { executeTool: (a: string, r: string, n: string, i: unknown) => Promise<unknown> };
    await expect(executeTool('sales', 'run-sales-1', 'runtime.read', { scope: 'runs.queued' }))
      .rejects.toThrow('not permitted');
    const started = sqlMock.mock.calls.filter((c) => String(c[0]).includes('tool.started'));
    expect(started).toHaveLength(0);
  });

  it('rejects an invalid runtime.read scope for engineering and audits the failure', async () => {
    vi.doMock('../api/_lib/db.js', () => ({ sql: sqlMock, json: () => undefined }));
    const { executeTool } = await vi.importActual('../api/_lib/agents/runtime.js') as { executeTool: (a: string, r: string, n: string, i: unknown) => Promise<unknown> };
    await expect(executeTool('engineering', 'run-eng-r2', 'runtime.read', { scope: 'anything' }))
      .rejects.toThrow(/scope must be one of/);
    // invalid input is rejected before any DB query; tool.started was recorded,
    // then flipped to tool.failed (the rejection is audited against the run).
    const started = sqlMock.mock.calls.filter((c) => String(c[0]).includes('tool.started'));
    const failed = sqlMock.mock.calls.filter((c) => String(c[0]).includes('tool.failed'));
    expect(started).toHaveLength(1);
    expect(failed).toHaveLength(1);
  });
});
