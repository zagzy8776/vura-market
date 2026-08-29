import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentContext } from '../api/_lib/agents/types.js';

/**
 * Phase A — Operations Intelligence must route its recent-order read through
 * the governed Agent Runtime (executeTool -> orders.read) and project the
 * result back to the existing shape. Runtime + db are mocked so no DB/network
 * is touched. The summary aggregation stays direct (intentional gap).
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

import { analyzeOperations } from '../api/_lib/agents/operations-intelligence.js';

const opsContext: AgentContext = { agentId: 'operations', runId: 'run-8001', task: 'snapshot' };

const summaryRow = {
  total: 12,
  unpaid: 2,
  pending_verification: 1,
  paid: 9,
  awaiting_payment: 2,
  in_progress: 4,
  out_for_delivery: 1,
  delivered: 3,
};

const toolOrders = [
  {
    id: 'o1',
    order_number: 'ORD-A',
    quantity: 2,
    total_kobo: 50000,
    status: 'out_for_delivery',
    payment_status: 'paid',
    delivery_city: 'Lagos',
    created_at: new Date('2026-01-01T10:00:00Z'),
    product_name: 'Solar',
    product_brand: 'Volt',
  },
  {
    id: 'o2',
    order_number: 'ORD-B',
    quantity: 1,
    total_kobo: 80000,
    status: 'awaiting_payment',
    payment_status: 'pending_verification',
    delivery_city: 'Abuja',
    created_at: new Date('2026-01-02T10:00:00Z'),
    product_name: 'Phone',
    product_brand: 'Nova',
  },
];

describe('Operations Intelligence routes recentOrders through governed executeTool', () => {
  beforeEach(() => {
    mockExec.mockReset();
    mockSql.mockReset();
    mockSql.mockImplementation(async () => [summaryRow]);
  });

  it('invokes orders.read through executeTool with operations agentId, runId, and limit 15', async () => {
    mockExec.mockResolvedValueOnce({ orders: toolOrders, summary: null, source: 'vura.orders' });
    mockSql.mockResolvedValueOnce([summaryRow]);

    await analyzeOperations(opsContext);

    const ordersCall = mockExec.mock.calls.find((c) => c[2] === 'orders.read');
    expect(ordersCall).toBeDefined();
    expect(ordersCall![0]).toBe('operations');
    expect(ordersCall![1]).toBe('run-8001');
    expect(ordersCall![3]).toMatchObject({ limit: 15 });
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  it('projects the governed result back to the exact existing recentOrders shape', async () => {
    mockExec.mockResolvedValueOnce({ orders: toolOrders, summary: null, source: 'vura.orders' });
    mockSql.mockResolvedValueOnce([summaryRow]);

    const result = await analyzeOperations(opsContext);

    expect(result.recentOrders).toEqual([
      {
        order_number: 'ORD-A',
        status: 'out_for_delivery',
        payment_status: 'paid',
        delivery_city: 'Lagos',
        total_kobo: 50000,
        created_at: toolOrders[0].created_at,
      },
      {
        order_number: 'ORD-B',
        status: 'awaiting_payment',
        payment_status: 'pending_verification',
        delivery_city: 'Abuja',
        total_kobo: 80000,
        created_at: toolOrders[1].created_at,
      },
    ]);
    expect(result.recentOrders[0]).not.toHaveProperty('product_name');
    expect(result.recentOrders[0]).not.toHaveProperty('quantity');
  });

  it('keeps summary and alerts unchanged (direct SQL, fulfillment behavior preserved)', async () => {
    mockExec.mockResolvedValueOnce({ orders: toolOrders, summary: null, source: 'vura.orders' });
    mockSql.mockResolvedValueOnce([summaryRow]);

    const result = await analyzeOperations(opsContext);

    expect(result.summary).toEqual(summaryRow);
    expect(mockSql).toHaveBeenCalledTimes(1);
    expect(result.alerts.join(' ')).toContain('1 payment(s) need verification');
    expect(result.alerts.join(' ')).toContain('2 order(s) still unpaid');
    expect(result.alerts.join(' ')).toContain('1 order(s) out for delivery');
  });

  it('soft-fails gracefully to empty recentOrders when governed source is empty while summary stays intact', async () => {
    mockExec.mockResolvedValueOnce({ orders: [], summary: null, source: 'vura.orders' });
    mockSql.mockResolvedValueOnce([summaryRow]);

    const result = await analyzeOperations(opsContext);

    expect(result.recentOrders).toEqual([]);
    expect(result.summary).toEqual(summaryRow);
    expect(result.alerts.length).toBeGreaterThan(0);
  });
});
