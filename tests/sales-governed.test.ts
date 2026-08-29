import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentContext } from '../api/_lib/agents/types.js';

/**
 * Phase A — Sales Intelligence must route its data acquisition through the
 * governed Agent Runtime (executeTool) for the tools that have exact
 * equivalents (analytics.read, inventory.read). Runtime + db are mocked so no
 * DB/network is touched.
 */

const mockExec = vi.hoisted(() => vi.fn());
const mockSql = vi.hoisted(() => vi.fn());

vi.mock('../api/_lib/agents/runtime.js', () => ({
  executeTool: mockExec,
  getAgentPolicy: vi.fn(),
  listTools: vi.fn(),
  registerTool: vi.fn(),
  requestApproval: vi.fn(),
  runAgent: vi.fn(),
}));

vi.mock('../api/_lib/db.js', () => ({
  sql: mockSql,
}));

import { analyzeSales } from '../api/_lib/agents/sales-intelligence.js';

const salesContext: AgentContext = { agentId: 'sales', runId: 'run-9001', task: 'report' };

const analyticsResult = {
  catalog: { products_active: 3, products_low_or_out: 0 },
  payments: [
    { payment_status: 'paid', count: 8 },
    { payment_status: 'unpaid', count: 2 },
  ],
  topProducts: [
    { name: 'Solar Panel', brand: 'Volt', orders: 5, volume_kobo: 100000 },
    { name: 'Charger', brand: 'Max', orders: 3, volume_kobo: 45000 },
  ],
  source: 'analytics',
};

const invResult = {
  byStatus: [
    { stock_status: 'in_stock', count: 12 },
    { stock_status: 'low_stock', count: 3 },
  ],
  attention: [],
  source: 'inventory',
};

const slowRows = [{ id: 'p1', name: 'Old Phone', brand: 'Nova', stock_status: 'in_stock', price_kobo: 500000 }];
const unpaidRows = [
  {
    order_number: 'ORD-1',
    delivery_name: 'Amina',
    delivery_phone: '+234800000000',
    total_kobo: 20000,
    payment_status: 'pending_verification',
    created_at: new Date(),
  },
];

describe('Sales Intelligence routes through governed executeTool', () => {
  beforeEach(() => {
    mockExec.mockReset();
    mockSql.mockReset();
    mockSql.mockImplementation(async () => slowRows);
  });

  it('invokes analytics.read and inventory.read through executeTool with sales agentId and runId', async () => {
    mockExec.mockImplementation(async (_a: string, _r: string, name: string) =>
      name === 'analytics.read' ? analyticsResult : name === 'inventory.read' ? invResult : {},
    );
    mockSql.mockResolvedValueOnce(slowRows).mockResolvedValueOnce(unpaidRows);

    await analyzeSales(salesContext);

    const calls = mockExec.mock.calls;
    const analyticsCall = calls.find((c) => c[2] === 'analytics.read');
    const invCall = calls.find((c) => c[2] === 'inventory.read');
    expect(analyticsCall).toBeDefined();
    expect(analyticsCall![0]).toBe('sales');
    expect(analyticsCall![1]).toBe('run-9001');
    expect(invCall).toBeDefined();
    expect(invCall![0]).toBe('sales');
    expect(invCall![1]).toBe('run-9001');
  });

  it('preserves return shape with topProducts/payments/stock from governed outputs and gaps kept direct', async () => {
    mockExec.mockImplementation(async (_a: string, _r: string, name: string) =>
      name === 'analytics.read' ? analyticsResult : name === 'inventory.read' ? invResult : {},
    );
    mockSql.mockResolvedValueOnce(slowRows).mockResolvedValueOnce(unpaidRows);

    const result = await analyzeSales(salesContext);

    expect(result.topProducts).toEqual(analyticsResult.topProducts);
    expect(result.payments).toEqual(analyticsResult.payments);
    expect(result.stock).toEqual(invResult.byStatus);
    expect(result.slowProducts).toEqual(slowRows);
    expect(result.followUpQueue).toHaveLength(1);
    expect(result.followUpQueue[0].customer).toBe('Amina');
    expect(result.followUpQueue[0].status).toBe('pending_human');
    expect(result.messageQueuePolicy).toContain('Human-only');
    expect(result.promotionRecommendations).toHaveLength(2);
  });

  it('builds insights from governed data (unpaid + low-stock triggers)', async () => {
    mockExec.mockImplementation(async (_a: string, _r: string, name: string) =>
      name === 'analytics.read' ? analyticsResult : name === 'inventory.read' ? invResult : {},
    );
    mockSql.mockResolvedValueOnce(slowRows).mockResolvedValueOnce(unpaidRows);

    const result = await analyzeSales(salesContext);

    expect(result.insights.join(' ')).toContain('Top seller: Volt Solar Panel (5 orders)');
    expect(result.insights.join(' ')).toContain('no orders in the last 30 days');
    expect(result.insights.join(' ')).toContain('follow up via admin');
    expect(result.insights.join(' ')).toContain('Inventory attention');
  });

  it('soft-fails gracefully to the fallback insight when governed sources are empty', async () => {
    mockExec.mockResolvedValue({});
    mockSql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await analyzeSales(salesContext);

    expect(result.topProducts).toEqual([]);
    expect(result.stock).toEqual([]);
    expect(result.payments).toEqual([]);
    expect(result.insights).toContain('Not enough order history yet for strong sales signals.');
    expect(result.followUpQueue).toEqual([]);
  });
});
