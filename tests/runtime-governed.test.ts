import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Phase A — Block B: exercises the REAL governed runtime.executeTool() path with
 * a mocked datastore (no DB/network). Proves policy enforcement and that
 * tool.started/completed/failed events are recorded against the actual runId.
 *
 * Event SQL shapes (verified against runtime.ts):
 *   INSERT tool.started -> values  [eventId, runId, toolName, risk, safeJson(input)]
 *   UPDATE tool.completed-> values [safeJson(output), eventId]   (keys off eventId)
 *   UPDATE tool.failed   -> values [errorMessage, eventId]        (keys off eventId)
 * The run association comes from the started row's run_id; completed/failed
 * updates reference the same eventId (=> same run).
 */

const sqlMock = vi.hoisted(() => vi.fn());
const researchMock = vi.hoisted(() => vi.fn());

vi.mock('../api/_lib/db.js', () => ({
  sql: sqlMock,
}));

vi.mock('../api/_lib/agents/research.js', () => ({
  researchSearch: researchMock,
  runResearch: vi.fn(),
}));

describe('governed runtime executeTool', () => {
  beforeEach(() => {
    sqlMock.mockReset();
    sqlMock.mockResolvedValue([]);
    researchMock.mockReset();
    researchMock.mockResolvedValue([]);
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('rejects a tool that is not in the trend-intelligence policy (no events written)', async () => {
    const { executeTool } = await import('../api/_lib/agents/runtime.js');
    // orders.read is NOT in trend-intelligence allowedTools.
    await expect(executeTool('trend-intelligence', 'run-0001', 'orders.read', {}))
      .rejects.toThrow('not permitted');
    // Policy rejection happens before any event is written.
    const started = sqlMock.mock.calls.filter((c) => String(c[0]).includes('tool.started'));
    expect(started).toHaveLength(0);
  });

  it('never auto-executes write-risk tools for trend-intelligence', async () => {
    const { executeTool } = await import('../api/_lib/agents/runtime.js');
    // notification.send is a registered write-risk builtin tool; no policy grants
    // it to trend-intelligence, so it must be rejected without executing.
    await expect(executeTool('trend-intelligence', 'run-0001', 'notification.send', {}))
      .rejects.toThrow();
    // Nothing was recorded — write tools do not auto-run.
    expect(sqlMock.mock.calls.length).toBe(0);
  });

  it('records tool.started (bound to runId) and tool.completed (bound to same eventId)', async () => {
    const { executeTool } = await import('../api/_lib/agents/runtime.js');
    const out = await executeTool('trend-intelligence', 'run-0001', 'web.search', { query: 'phones' });

    expect(out).toBeDefined();
    const started = sqlMock.mock.calls.filter((c) => String(c[0]).includes('tool.started'));
    const completed = sqlMock.mock.calls.filter((c) => String(c[0]).includes('tool.completed'));
    expect(started).toHaveLength(1);
    expect(completed).toHaveLength(1);

    // started INSERT binds runId as its 2nd value (index 2 of the raw call).
    const startedCall = started[0];
    expect([...startedCall]).toContain('run-0001');
    const eventId = startedCall[1];

    // completed UPDATE references the exact same eventId -> same run.
    const completedCall = completed[0];
    expect([...completedCall]).toContain(eventId);
  });

  it('records tool.failed (bound to the same eventId) when a tool throws', async () => {
    const { executeTool } = await import('../api/_lib/agents/runtime.js');
    // Let the started-event insert succeed, then make the tool's products.search
    // query throw. executeTool should flip the event to tool.failed.
    sqlMock.mockResolvedValueOnce([]); // tool.started insert
    sqlMock.mockRejectedValueOnce(new Error('db down')); // products.search query throws
    await expect(executeTool('trend-intelligence', 'run-0001', 'products.search', {}))
      .rejects.toThrow('db down');

    const started = sqlMock.mock.calls.filter((c) => String(c[0]).includes('tool.started'));
    const failed = sqlMock.mock.calls.filter((c) => String(c[0]).includes('tool.failed'));
    expect(started).toHaveLength(1);
    expect(failed).toHaveLength(1);

    // started INSERT binds runId; failed UPDATE references the same eventId.
    expect([...started[0]]).toContain('run-0001');
    expect([...failed[0]]).toContain(started[0][1]);
  });
});

describe('governed runtime executeTool for product-intelligence policy', () => {
  beforeEach(() => {
    sqlMock.mockReset();
    sqlMock.mockResolvedValue([]);
    researchMock.mockReset();
    researchMock.mockResolvedValue([]);
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('permits web.search and products.search for product-intelligence (both are allowed)', async () => {
    const { executeTool } = await import('../api/_lib/agents/runtime.js');
    const web = await executeTool('product-intelligence', 'run-0002', 'web.search', { query: 'Nokia 3310' });
    expect(web).toBeDefined();
    const prod = await executeTool('product-intelligence', 'run-0003', 'products.search', { q: 'Nokia 3310' });
    expect(prod).toBeDefined();

    // Each tool wrote a tool.started insert bound to its own runId, plus one
    // tool.completed update keyed off the same eventId.
    const startedWeb = sqlMock.mock.calls.filter((c) => String(c[0]).includes('tool.started') && [...c].includes('run-0002') && [...c].includes('web.search'));
    const startedProd = sqlMock.mock.calls.filter((c) => String(c[0]).includes('tool.started') && [...c].includes('run-0003') && [...c].includes('products.search'));
    const completed = sqlMock.mock.calls.filter((c) => String(c[0]).includes('tool.completed'));
    expect(startedWeb).toHaveLength(1);
    expect(startedProd).toHaveLength(1);
    expect(completed).toHaveLength(2);
  });

  it('rejects a tool not in the product-intelligence policy (no events written)', async () => {
    const { executeTool } = await import('../api/_lib/agents/runtime.js');
    // orders.read is NOT in product-intelligence allowedTools.
    await expect(executeTool('product-intelligence', 'run-0002', 'orders.read', {}))
      .rejects.toThrow('not permitted');
    const started = sqlMock.mock.calls.filter((c) => String(c[0]).includes('tool.started'));
    expect(started).toHaveLength(0);
  });
});

describe('governed runtime executeTool for marketing-intelligence policy', () => {
  beforeEach(() => {
    sqlMock.mockReset();
    sqlMock.mockResolvedValue([]);
    researchMock.mockReset();
    researchMock.mockResolvedValue([]);
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('permits web.search for marketing-intelligence (allowed) and records events', async () => {
    const { executeTool } = await import('../api/_lib/agents/runtime.js');
    const out = await executeTool('marketing-intelligence', 'run-0004', 'web.search', { query: 'solar adoption' });
    expect(out).toBeDefined();
    const started = sqlMock.mock.calls.filter((c) => String(c[0]).includes('tool.started') && [...c].includes('run-0004') && [...c].includes('web.search'));
    const completed = sqlMock.mock.calls.filter((c) => String(c[0]).includes('tool.completed'));
    expect(started).toHaveLength(1);
    expect(completed).toHaveLength(1);
  });

  it('rejects a tool not in the marketing-intelligence policy (no events written)', async () => {
    const { executeTool } = await import('../api/_lib/agents/runtime.js');
    // orders.read is NOT in marketing-intelligence allowedTools.
    await expect(executeTool('marketing-intelligence', 'run-0004', 'orders.read', {}))
      .rejects.toThrow('not permitted');
    const started = sqlMock.mock.calls.filter((c) => String(c[0]).includes('tool.started'));
    expect(started).toHaveLength(0);
  });
});

describe('governed runtime executeTool for sales policy', () => {
  beforeEach(() => {
    sqlMock.mockReset();
    sqlMock.mockResolvedValue([]);
    researchMock.mockReset();
    researchMock.mockResolvedValue([]);
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('permits analytics.read and inventory.read for sales (allowed) and records events', async () => {
    const { executeTool } = await import('../api/_lib/agents/runtime.js');
    for (const tool of ['analytics.read', 'inventory.read']) {
      const out = await executeTool('sales', 'run-0005', tool, {});
      expect(out).toBeDefined();
    }
    const started = sqlMock.mock.calls.filter((c) =>
      String(c[0]).includes('tool.started') &&
      [...c].includes('run-0005') &&
      ([...c].includes('analytics.read') || [...c].includes('inventory.read')),
    );
    const completed = sqlMock.mock.calls.filter((c) => String(c[0]).includes('tool.completed'));
    expect(started).toHaveLength(2);
    expect(completed).toHaveLength(2);
  });

  it('rejects a write-risk tool not permitted for sales (no events written)', async () => {
    const { executeTool } = await import('../api/_lib/agents/runtime.js');
    // inventory.write is not in the sales policy (and is not a registered tool),
    // so it must be rejected before executing anything.
    await expect(executeTool('sales', 'run-0005', 'inventory.write', {}))
      .rejects.toThrow();
    const started = sqlMock.mock.calls.filter((c) => String(c[0]).includes('tool.started'));
    expect(started).toHaveLength(0);
  });
});

describe('governed runtime executeTool for operations policy', () => {
  beforeEach(() => {
    sqlMock.mockReset();
    sqlMock.mockResolvedValue([]);
    researchMock.mockReset();
    researchMock.mockResolvedValue([]);
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('permits orders.read for operations (allowed) and records events', async () => {
    const { executeTool } = await import('../api/_lib/agents/runtime.js');
    const out = await executeTool('operations', 'run-0006', 'orders.read', { limit: 15 });
    expect(out).toBeDefined();
    const started = sqlMock.mock.calls.filter((c) =>
      String(c[0]).includes('tool.started') && [...c].includes('run-0006') && [...c].includes('orders.read'),
    );
    const completed = sqlMock.mock.calls.filter((c) => String(c[0]).includes('tool.completed'));
    expect(started).toHaveLength(1);
    expect(completed).toHaveLength(1);
  });

  it('rejects a tool not permitted for operations (no events written)', async () => {
    const { executeTool } = await import('../api/_lib/agents/runtime.js');
    // web.search is NOT in the operations allowedTools.
    await expect(executeTool('operations', 'run-0006', 'web.search', {}))
      .rejects.toThrow('not permitted');
    const started = sqlMock.mock.calls.filter((c) => String(c[0]).includes('tool.started'));
    expect(started).toHaveLength(0);
  });
});


