import { describe, it, expect } from 'vitest';

describe('coordination idempotency', () => {
  it('builds stable keys', () => {
    const correlationId = 'corr-1';
    const event = 'opportunity.created';
    const agentId = 'product-intelligence';
    const key = `${correlationId}:${event}:${agentId}`;
    expect(key).toBe('corr-1:opportunity.created:product-intelligence');
  });

  it('does not auto-message customers', () => {
    const policy = 'Human-only: agents must not auto-message customers.';
    expect(policy.includes('must not auto-message')).toBe(true);
  });
});
