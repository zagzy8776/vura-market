/**
 * Phase L — structured agent-to-agent handoffs via queue (not mega-prompts).
 */
import { enqueueAgentJob } from './job-queue.js';
import { remember } from './memory.js';
import type { AgentId } from './types.js';

export async function emitCoordination(input: {
  fromAgent: AgentId;
  event: string;
  correlationId: string;
  parentRunId?: string;
  sourceOpportunityId?: string;
  payload?: Record<string, unknown>;
}) {
  await remember({
    agentId: input.fromAgent,
    kind: 'signal',
    content: input.event,
    correlationId: input.correlationId,
    opportunityId: input.sourceOpportunityId,
    runId: input.parentRunId,
    metadata: input.payload,
    importance: 60,
  });

  const chain: Partial<Record<string, { agentId: AgentId; task: string }>> = {
    'opportunity.created': { agentId: 'product-intelligence', task: 'Investigate opportunity' },
    'product.research.completed': { agentId: 'marketing-intelligence', task: 'Marketing brief from product research' },
    'marketing.brief.completed': { agentId: 'sales', task: 'Evaluate commercial demand' },
    'commercial.signal.created': { agentId: 'operations', task: 'Operations readiness check' },
  };

  const next = chain[input.event];
  if (!next) return { enqueued: false };

  const idempotencyKey = `${input.correlationId}:${input.event}:${next.agentId}`;
  const job = await enqueueAgentJob({
    agentId: next.agentId,
    task: next.task,
    input: {
      ...input.payload,
      correlationId: input.correlationId,
      parentRunId: input.parentRunId,
      sourceOpportunityId: input.sourceOpportunityId,
      triggeredBy: input.fromAgent,
      triggeredEvent: input.event,
    },
    idempotencyKey,
  });
  return { enqueued: true, ...job, targetAgent: next.agentId };
}
