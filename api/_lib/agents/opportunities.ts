import { sql } from '../db.js';
import type { AgentId } from './types.js';
import type { TrendCandidate } from './trend.js';

export type OpportunityStatus = 'new' | 'watching' | 'investigating' | 'approved' | 'dismissed';

export interface Opportunity {
  id: string;
  agentId: AgentId;
  name: string;
  category: string;
  signal: string;
  score: number | null;
  source: string | null;
  evidence: string | null;
  status: OpportunityStatus;
  createdAt: string;
}

export async function saveTrendCandidates(candidates: TrendCandidate[], agentId: AgentId = 'trend-intelligence') {
  const saved: Opportunity[] = [];
  for (const candidate of candidates) {
    const score = typeof candidate.score === 'number' && Number.isFinite(candidate.score)
      ? Math.min(100, Math.max(0, Math.round(candidate.score))) : null;
    const rows = await sql`
      INSERT INTO agent_opportunities (agent_id, name, category, signal, score, source, evidence, status)
      VALUES (${agentId}, ${candidate.name.slice(0, 300)}, ${candidate.category.slice(0, 160)}, ${candidate.signal.slice(0, 1000)}, ${score}, ${candidate.source?.slice(0, 1000) ?? null}, ${candidate.evidence?.slice(0, 5000) ?? null}, 'new')
      RETURNING id, agent_id, name, category, signal, score, source, evidence, status, created_at
    `;
    const row = rows[0];
    if (row) saved.push(mapOpportunity(row));
  }
  return saved;
}

export async function listOpportunities(input: { status?: OpportunityStatus; category?: string; limit?: number } = {}) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const rows = input.status
    ? await sql`SELECT id, agent_id, name, category, signal, score, source, evidence, status, created_at FROM agent_opportunities WHERE status = ${input.status} ORDER BY score DESC NULLS LAST, created_at DESC LIMIT ${limit}`
    : input.category
      ? await sql`SELECT id, agent_id, name, category, signal, score, source, evidence, status, created_at FROM agent_opportunities WHERE category = ${input.category} ORDER BY score DESC NULLS LAST, created_at DESC LIMIT ${limit}`
      : await sql`SELECT id, agent_id, name, category, signal, score, source, evidence, status, created_at FROM agent_opportunities ORDER BY score DESC NULLS LAST, created_at DESC LIMIT ${limit}`;
  return rows.map(mapOpportunity);
}

export async function updateOpportunityStatus(id: string, status: OpportunityStatus) {
  const rows = await sql`
    UPDATE agent_opportunities SET status = ${status}, updated_at = now()
    WHERE id = ${id}
    RETURNING id, agent_id, name, category, signal, score, source, evidence, status, created_at
  `;
  return rows[0] ? mapOpportunity(rows[0]) : null;
}

function mapOpportunity(row: Record<string, unknown>): Opportunity {
  return {
    id: String(row.id), agentId: String(row.agent_id) as AgentId, name: String(row.name), category: String(row.category),
    signal: String(row.signal), score: row.score == null ? null : Number(row.score), source: row.source == null ? null : String(row.source),
    evidence: row.evidence == null ? null : String(row.evidence), status: String(row.status) as OpportunityStatus,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}
