import { describe, expect, it } from 'vitest';
import { GROWTH_DAG, SYSTEM_HEALTH_DAG } from '../missions.js';

describe('Growth mission DAG', () => {
  it('runs product/marketing/sales/operations with no dependencies (parallel)', () => {
    const parallel = GROWTH_DAG.filter((s) => s.dependsOn.length === 0);
    expect(parallel.map((s) => s.stepKey).sort()).toEqual(
      ['marketing', 'operations', 'product', 'sales'].sort(),
    );
  });

  it('reconcile waits for all four intelligence steps', () => {
    const rec = GROWTH_DAG.find((s) => s.stepKey === 'reconcile');
    expect(rec?.dependsOn.sort()).toEqual(['marketing', 'operations', 'product', 'sales'].sort());
    expect(rec?.synthetic).toBe('reconcile');
  });

  it('listing_draft depends on reconcile and is marked synthetic scaffolding', () => {
    const draft = GROWTH_DAG.find((s) => s.stepKey === 'listing_draft');
    expect(draft?.dependsOn).toEqual(['reconcile']);
    expect(draft?.synthetic).toBe('listing_draft');
  });

  it('await_approval is the terminal human gate before any publish', () => {
    const gate = GROWTH_DAG.find((s) => s.stepKey === 'await_approval');
    expect(gate?.dependsOn).toEqual(['listing_draft']);
    expect(gate?.synthetic).toBe('await_approval');
    expect(gate?.agentId).toBeNull();
  });

  it('does not include social publish or catalog write steps in Phase 1', () => {
    const keys = GROWTH_DAG.map((s) => s.stepKey);
    expect(keys).not.toContain('publish');
    expect(keys).not.toContain('social');
    expect(keys).not.toContain('catalog_write');
  });
});

describe('System health DAG', () => {
  it('stays separate from growth and ends in approval', () => {
    expect(SYSTEM_HEALTH_DAG.some((s) => s.agentId === 'engineering')).toBe(true);
    expect(SYSTEM_HEALTH_DAG.at(-1)?.synthetic).toBe('await_approval');
  });
});

/** Pure helper mirroring mission finalization rules (no DB). */
function finalizeMissionStatus(stepStatuses: string[]): 'awaiting_approval' | 'completed' | 'failed' | 'running' {
  if (stepStatuses.some((s) => s === 'awaiting_approval')) return 'awaiting_approval';
  if (stepStatuses.every((s) => s === 'completed' || s === 'skipped')) return 'completed';
  const inFlight = stepStatuses.some((s) => ['pending', 'ready', 'queued', 'running'].includes(s));
  if (stepStatuses.some((s) => s === 'failed') && !inFlight) return 'failed';
  return 'running';
}

describe('Mission finalization rules', () => {
  it('does not claim success when one agent failed', () => {
    expect(
      finalizeMissionStatus(['completed', 'failed', 'completed', 'completed', 'pending']),
    ).toBe('running');
    expect(
      finalizeMissionStatus(['completed', 'failed', 'completed', 'completed', 'completed']),
    ).toBe('failed');
  });

  it('stays awaiting_approval and does not auto-complete past the human gate', () => {
    expect(
      finalizeMissionStatus(['completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'awaiting_approval']),
    ).toBe('awaiting_approval');
  });

  it('completes only when every step is terminal success', () => {
    expect(finalizeMissionStatus(['completed', 'completed', 'skipped'])).toBe('completed');
  });
});
