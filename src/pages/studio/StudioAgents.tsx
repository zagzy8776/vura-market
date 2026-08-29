import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Bot, Check, Clock, Loader2, Play, RefreshCw, Shield, ShieldAlert, X } from 'lucide-react';
import { authHeaders } from '@/lib/session';

type Job = {
  id: string;
  agent_id: string;
  task: string;
  status: string;
  attempts?: number;
  error?: string | null;
  provider?: string | null;
  model?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  result?: unknown;
  metadata?: unknown;
};

type Notif = {
  id: string;
  title: string;
  message: string;
  severity?: string;
  agent_id?: string;
  created_at?: string;
};

type Approval = {
  id: string;
  run_id?: string;
  agent_id?: string;
  tool_name?: string;
  risk?: string;
  input?: unknown;
  status?: string;
  requested_at?: string;
  decided_at?: string;
  decided_by?: string;
  decision_note?: string;
};

type Schedule = {
  id: string;
  agent_id?: string;
  task?: string;
  interval_minutes?: number;
  enabled?: boolean;
  last_enqueued_at?: string | null;
  next_run_at?: string | null;
};

type Mission = {
  id: string;
  goal: string;
  mission_type?: string;
  status: string;
  policy_level?: number;
  correlation_id?: string;
  opportunity_id?: string | null;
  created_at?: string;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
};

type MissionStep = {
  id: string;
  mission_id?: string;
  step_key: string;
  agent_id?: string | null;
  depends_on?: string[];
  status: string;
  run_id?: string | null;
  input?: unknown;
  result?: unknown;
  attempts?: number;
  max_attempts?: number;
  error?: string | null;
  sort_order?: number;
  started_at?: string | null;
  completed_at?: string | null;
};

type AgentEvent = {
  id: string;
  run_id?: string;
  event_type: string;
  tool_name?: string | null;
  risk?: string | null;
  input?: unknown;
  output?: unknown;
  error?: string | null;
  created_at?: string;
};

const AGENTS = [
  {
    id: 'trend-intelligence',
    label: 'Trend',
    blurb: 'Find what is moving in the market. Fills Opportunities.',
    defaultTask: 'Scan Nigeria market demand and list evidence-backed opportunities',
  },
  {
    id: 'product-intelligence',
    label: 'Product',
    blurb: 'Deep-dive one product idea (name in task).',
    defaultTask: 'Investigate MagSafe power bank for Nigeria retail',
  },
  {
    id: 'marketing-intelligence',
    label: 'Marketing',
    blurb: 'Content angles and audience — no auto-posting.',
    defaultTask: 'Scout marketing angles for phone accessories in Nigeria',
  },
  {
    id: 'sales',
    label: 'Sales',
    blurb: 'What sells, stock risk, follow-up ideas.',
    defaultTask: 'Sales and inventory intelligence scan',
  },
  {
    id: 'operations',
    label: 'Operations',
    blurb: 'Orders and fulfillment health.',
    defaultTask: 'Operations fulfillment scan',
  },
  {
    id: 'engineering',
    label: 'Engineering',
    blurb: 'Site and worker health check.',
    defaultTask: 'Engineering health and incident scan',
  },
] as const;

const TREND_CATEGORIES = [
  'phones',
  'Phone Accessories',
  'laptops',
  'earphones',
  'solar',
  'inverters',
  'Fashion',
  'Shoes',
  'Bags',
  'Electronics',
  'Gaming',
  'Home Appliances',
  'Beverages',
  'Cars',
  'Car Accessories',
];

const MISSION_STATUS_COLOR: Record<string, string> = {
  queued: 'text-amber-300',
  running: 'text-sky-300',
  awaiting_approval: 'text-violet-300',
  completed: 'text-emerald-300',
  failed: 'text-red-300',
  cancelled: 'text-white/50',
};

const STEP_STATUS_COLOR: Record<string, string> = {
  pending: 'text-white/40',
  ready: 'text-amber-300',
  queued: 'text-amber-300',
  running: 'text-sky-300',
  completed: 'text-emerald-300',
  failed: 'text-red-300',
  awaiting_approval: 'text-violet-300',
  skipped: 'text-white/40',
};

function formatWhen(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = Date.now();
  const diff = Math.round((now - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatClock(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function statusColor(status: string): string {
  if (status === 'completed') return 'text-emerald-300';
  if (status === 'failed') return 'text-red-300';
  if (status === 'running' || status === 'queued') return 'text-amber-300';
  return 'text-white/50';
}

async function getApi<T>(resource: string): Promise<T> {
  const [res, ...rest] = resource.split('&');
  let url = `/api/admin?resource=${encodeURIComponent(res)}`;
  if (rest.length) url += `&${rest.join('&')}`;
  const r = await fetch(url, { credentials: 'include', headers: authHeaders() });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((b as { error?: string })?.error || `Failed (${r.status})`);
  return b as T;
}

async function postAgent(body: Record<string, unknown>): Promise<{ runId?: string; status?: string; message?: string; error?: string }> {
  const r = await fetch('/api/admin?resource=agents', {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const b = (await r.json().catch(() => ({}))) as { runId?: string; status?: string; message?: string; error?: string };
  if (!r.ok) throw new Error(b.error || `Start failed (${r.status})`);
  return b;
}

async function postMission(body: Record<string, unknown>): Promise<{ missionId?: string; correlationId?: string; status?: string; message?: string; error?: string }> {
  const r = await fetch('/api/admin?resource=agent-missions', {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const b = (await r.json().catch(() => ({}))) as { missionId?: string; correlationId?: string; status?: string; message?: string; error?: string };
  if (!r.ok) throw new Error(b.error || `Start failed (${r.status})`);
  return b;
}

async function decideApproval(approvalId: string, decision: 'approved' | 'rejected', note?: string): Promise<void> {
  const r = await fetch('/api/admin?resource=agent-approvals', {
    method: 'PATCH',
    credentials: 'include',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ approvalId, decision, note }),
  });
  const b = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new Error(b.error || `Decision failed (${r.status})`);
}

function hasNestedMessage(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.note === 'string') return obj.note;
    return JSON.stringify(obj);
  }
  return '';
}

export default function StudioAgents() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [opportunities, setOpportunities] = useState<unknown[]>([]);
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');
  const [starting, setStarting] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>(['phones', 'Phone Accessories']);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedJobEvents, setSelectedJobEvents] = useState<AgentEvent[]>([]);
  const [selectedNotif, setSelectedNotif] = useState<Notif | null>(null);
  const [selectedMission, setSelectedMission] = useState<{ mission: Mission; steps: MissionStep[] } | null>(null);
  const [missionGoal, setMissionGoal] = useState('');
  const [missionProduct, setMissionProduct] = useState('');
  const [startingMission, setStartingMission] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [j, a, s, o, n, mi] = await Promise.all([
        getApi<{ jobs: Job[] }>('agent-jobs&limit=50'),
        getApi<{ approvals: Approval[] }>('agent-approvals&status=pending'),
        getApi<{ schedules: Schedule[] }>('agent-schedules'),
        getApi<{ opportunities: unknown[] }>('agent-opportunities&limit=20'),
        getApi<{ notifications: Notif[] }>('agent-notifications&limit=30'),
        getApi<{ missions: Mission[] }>('agent-missions'),
      ]);
      setJobs(j.jobs || []);
      setApprovals(a.approvals || []);
      setSchedules(s.schedules || []);
      setOpportunities(o.opportunities || []);
      setNotifications(n.notifications || []);
      setMissions(mi.missions || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load command center');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const active = jobs.some((j) => j.status === 'queued' || j.status === 'running');
    const activeMissions = missions.some((m) => m.status === 'running' || m.status === 'queued');
    if (!active && !activeMissions) return;
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [jobs, missions, load]);

  const loadJobEvents = useCallback(async (job: Job) => {
    setSelectedJob(job);
    setSelectedJobEvents([]);
    if (!job.id) return;
    try {
      const { events } = await getApi<{ events: AgentEvent[] }>(`agent-events&runId=${encodeURIComponent(job.id)}`);
      setSelectedJobEvents(events || []);
    } catch {
      setSelectedJobEvents([]);
    }
  }, []);

  const loadMissionDetail = useCallback(async (missionId: string) => {
    try {
      const detail = await getApi<{ mission: Mission; steps: MissionStep[] }>(`agent-missions&missionId=${encodeURIComponent(missionId)}`);
      setSelectedMission(detail);
    } catch {
      setSelectedMission(null);
    }
  }, []);

  const byAgent = (id: string) => jobs.filter((j) => j.agent_id === id);
  const running = jobs.filter((j) => j.status === 'running' || j.status === 'queued');
  const failed = jobs.filter((j) => j.status === 'failed');
  const missionsInFlight = missions.filter((m) => m.status === 'running' || m.status === 'queued' || m.status === 'awaiting_approval');
  const criticalNotifs = notifications.filter((n) => n.severity === 'critical');

  const dedupedNotifications = useMemo(() => {
    const seen = new Set<string>();
    const out: Notif[] = [];
    for (const n of notifications) {
      const key = `${n.title}::${n.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(n);
    }
    return out;
  }, [notifications]);

  const toggleCategory = (c: string) => {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const startAgent = async (agentId: string, task: string, extra?: Record<string, unknown>) => {
    setStarting(agentId);
    setBanner('');
    setError('');
    try {
      const res = await postAgent({ agentId, task, ...extra });
      setBanner(
        res.runId
          ? `Job started (${res.status || 'queued'}). ID ${res.runId.slice(0, 8)}… — agents work in the background on Fly.`
          : res.message || 'Job started.',
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start agent');
    } finally {
      setStarting(null);
    }
  };

  const runTrend = () =>
    startAgent('trend-intelligence', `Scan Nigeria demand for: ${categories.join(', ') || 'general retail'}`, {
      categories: categories.length ? categories : ['phones'],
    });

  const startMission = async () => {
    if (missionGoal.trim().length < 3) return;
    setStartingMission(true);
    setBanner('');
    setError('');
    try {
      const res = await postMission({
        goal: missionGoal.trim(),
        productName: missionProduct.trim() || undefined,
        categories,
      });
      setBanner(
        `Growth mission started (${res.status || 'queued'})${res.correlationId ? ` · ${res.correlationId}` : ''}. Steps run through the governed tool loop — it ends at a human approval gate.`,
      );
      setMissionGoal('');
      setMissionProduct('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start mission');
    } finally {
      setStartingMission(false);
    }
  };

  const decide = async (approval: Approval, decision: 'approved' | 'rejected') => {
    setDeciding(approval.id);
    setError('');
    try {
      await decideApproval(approval.id, decision);
      setBanner(decision === 'approved' ? 'Approval granted. The write action may now proceed under audit.' : 'Approval rejected.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record decision');
    } finally {
      setDeciding(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-vura-300">
            <Bot size={18} />
            <span className="text-xs font-bold uppercase tracking-wider">Agents</span>
          </div>
          <h1 className="mt-1 text-2xl font-black text-white md:text-3xl">Command Center</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/45">
            Start a scan here. Agents research in the background, then fill <b className="text-white/70">Opportunities</b>{' '}
            and alerts. You stay in control of what gets listed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>
      )}
      {banner && (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{banner}</p>
      )}

      {/* System health strip */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ['Running / queued', running.length, running.length ? 'text-amber-300' : 'text-white'],
          ['Failed (recent)', failed.length, failed.length ? 'text-red-300' : 'text-white'],
          ['Pending approvals', approvals.length, approvals.length ? 'text-violet-300' : 'text-white'],
          ['Missions in flight', missionsInFlight.length, missionsInFlight.length ? 'text-sky-300' : 'text-white'],
          ['Opportunities', opportunities.length, 'text-white'],
          ['Critical alerts', criticalNotifs.length, criticalNotifs.length ? 'text-red-300' : 'text-white'],
        ].map(([label, n, color]) => (
          <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/35">
              {String(label) === 'Critical alerts' ? <ShieldAlert size={11} /> : null}
              {String(label)}
            </div>
            <div className={`mt-1 text-2xl font-black ${String(color)}`}>{n}</div>
          </div>
        ))}
      </section>

      {/* Primary action: Trend scan */}
      <section className="rounded-2xl border border-vura-500/30 bg-gradient-to-br from-vura-500/10 to-transparent p-4 md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-black uppercase tracking-wider text-vura-200">Run market scan</h2>
            <p className="mt-1 text-sm text-white/50">
              Pick categories you sell. Trend agent searches the web, scores ideas, and saves them under Opportunities.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {TREND_CATEGORIES.map((c) => {
                const on = categories.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleCategory(c)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                      on
                        ? 'border-vura-400/50 bg-vura-500/25 text-white'
                        : 'border-white/10 bg-black/20 text-white/55 hover:border-white/25'
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            disabled={!!starting || categories.length === 0}
            onClick={() => void runTrend()}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-vura-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-vura-500/20 disabled:opacity-50"
          >
            {starting === 'trend-intelligence' ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
            Start Trend scan
          </button>
        </div>
      </section>

      {/* Growth missions */}
      <section className="rounded-2xl border border-vura-500/25 bg-gradient-to-br from-vura-500/[0.06] to-transparent p-4 md:p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-vura-200">
            <Activity size={14} /> Growth missions
          </h2>
          {missions.length > 0 && (
            <span className="text-[11px] text-white/40">
              {missions.filter((m) => m.status === 'completed').length} completed · {missionsInFlight.length} in flight
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-white/45">
          Product → Marketing → Sales → Operations → <b className="text-vura-300">human approval gate</b>. Every step runs
          through the governed tool loop; nothing is published or written autonomously.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1.4fr]">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <b className="text-xs text-white/80">Start a growth mission</b>
            <input
              value={missionGoal}
              onChange={(e) => setMissionGoal(e.target.value)}
              placeholder="Mission goal — e.g. Grow the solar power bank category"
              className="mt-3 w-full rounded-xl border border-white/10 bg-[#111522] px-3 py-2.5 text-sm outline-none focus:border-vura-500"
            />
            <input
              value={missionProduct}
              onChange={(e) => setMissionProduct(e.target.value)}
              placeholder="Optional product to focus on"
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#111522] px-3 py-2.5 text-sm outline-none focus:border-vura-500"
            />
            <button
              type="button"
              disabled={startingMission || missionGoal.trim().length < 3}
              onClick={() => void startMission()}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-vura-500 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
            >
              {startingMission ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Start mission
            </button>
          </div>

          <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {missions.length === 0 && <p className="text-sm text-white/35">No missions yet — start one above.</p>}
            {missions.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => void loadMissionDetail(m.id)}
                className="flex w-full flex-col rounded-xl border border-white/5 bg-black/20 px-3 py-2.5 text-left transition hover:border-vura-500/40 hover:bg-white/[0.04]"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className={`text-xs font-bold ${MISSION_STATUS_COLOR[m.status] || 'text-white'}`}>{m.status}</span>
                  <span className="text-[10px] text-white/35">· policy L{m.policy_level ?? 2}</span>
                  <span className="text-[10px] text-white/30">· {formatWhen(m.started_at || m.created_at)}</span>
                  <span className="ml-auto text-[10px] text-vura-300">Details →</span>
                </div>
                <span className="mt-1 block truncate text-sm text-white/85">{m.goal}</span>
                {m.error ? <span className="mt-0.5 block truncate text-xs text-red-300/90">{m.error}</span> : null}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AGENTS.map((a) => {
          const list = byAgent(a.id);
          const last = list[0];
          return (
            <div key={a.id} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-2">
                <b className="text-sm text-white">{a.label}</b>
                <Activity size={14} className="text-white/30" />
              </div>
              <p className="mt-1 flex-1 text-xs text-white/40">{a.blurb}</p>
              {last ? (
                <p className="mt-2 text-[11px] text-white/45">
                  Last: <span className={statusColor(last.status)}>{last.status}</span>
                  {last.started_at || last.completed_at ? (
                    <span className="text-white/35"> · {formatWhen(last.completed_at || last.started_at)}</span>
                  ) : null}
                </p>
              ) : (
                <p className="mt-2 text-[11px] text-white/30">No runs yet</p>
              )}
              <button
                type="button"
                disabled={!!starting}
                onClick={() => void startAgent(a.id, a.defaultTask, a.id === 'trend-intelligence' ? { categories } : {})}
                className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 py-2 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-50"
              >
                {starting === a.id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                Run {a.label}
              </button>
            </div>
          );
        })}
      </div>

      {loading && jobs.length === 0 ? (
        <div className="flex justify-center py-12 text-white/40">
          <Loader2 className="animate-spin" size={28} />
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/40">
              <Clock size={14} /> Job history
            </h2>
            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {jobs.length === 0 && <li className="text-sm text-white/40">No jobs yet — start a Trend scan above.</li>}
              {jobs.slice(0, 40).map((j) => (
                <li key={j.id}>
                  <button
                    type="button"
                    onClick={() => void loadJobEvents(j)}
                    className="w-full rounded-xl border border-white/5 bg-black/20 px-3 py-2.5 text-left text-xs transition hover:border-vura-500/40 hover:bg-white/[0.04]"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-bold text-white/85">{j.agent_id}</span>
                      <span className={statusColor(j.status)}>{j.status}</span>
                      <span className="text-white/30">·</span>
                      <span className="text-white/40">{formatWhen(j.completed_at || j.started_at) || '—'}</span>
                      {j.provider ? <span className="text-white/30">· {j.provider}</span> : null}
                      <span className="ml-auto text-[10px] text-vura-300">Tap for details →</span>
                    </div>
                    <span className="mt-0.5 block truncate text-white/50">{j.task}</span>
                    {j.error ? <span className="mt-0.5 block truncate text-red-300/90">{j.error}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/40">
              <Shield size={14} /> Approval requests
            </h2>
            <p className="mt-1 text-xs text-white/40">
              An agent proposes a write or destructive action here. Nothing executes until you approve — and every decision
              is logged to the audit trail.
            </p>
            {approvals.length === 0 ? (
              <p className="mt-3 text-sm text-white/40">No pending approvals.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {approvals.map((a) => (
                  <li key={a.id} className="rounded-xl border border-white/5 bg-black/20 p-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      <span className={`font-bold ${a.risk === 'destructive' ? 'text-red-300' : 'text-violet-300'}`}>
                        {a.risk}
                      </span>
                      <span className="font-bold text-white/85">{a.tool_name}</span>
                      <span className="text-white/35">· {a.agent_id || 'agent'}</span>
                      <span className="text-white/35">· {formatWhen(a.requested_at)}</span>
                    </div>
                    <p className="mt-1 text-xs text-white/55">{hasNestedMessage(a.input) || 'Specifically request review.'}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={deciding === a.id}
                        onClick={() => void decide(a, 'approved')}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/90 px-3 py-1.5 text-xs font-bold text-black hover:bg-emerald-400 disabled:opacity-50"
                      >
                        {deciding === a.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={deciding === a.id}
                        onClick={() => void decide(a, 'rejected')}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                      >
                        <X size={12} /> Reject
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/40">
              <Clock size={14} /> Schedules
            </h2>
            {schedules.length === 0 ? (
              <p className="mt-2 text-sm text-white/40">No schedules configured.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-xs">
                {schedules.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-white/5 bg-black/15 px-3 py-2">
                    <span className={`font-bold ${s.enabled ? 'text-white/85' : 'text-white/35'}`}>{s.agent_id || 'agent'}</span>
                    <span className="text-white/45">every {s.interval_minutes}m</span>
                    {s.enabled ? <span className="text-emerald-300">enabled</span> : <span className="text-white/35">disabled</span>}
                    <span className="text-white/30">· next {formatClock(s.next_run_at)}</span>
                    {s.last_enqueued_at ? <span className="text-white/30">· last {formatWhen(s.last_enqueued_at)}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white/40">Alerts & history</h2>
            {dedupedNotifications.length > notifications.length ? (
              <p className="mt-1 text-[11px] text-white/30">Showing {dedupedNotifications.length} of {notifications.length} (duplicates collapsed).</p>
            ) : null}
            <ul className="mt-3 space-y-2">
              {dedupedNotifications.length === 0 && <li className="text-sm text-white/40">No alerts yet.</li>}
              {dedupedNotifications.slice(0, 15).map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedNotif(n)}
                    className="w-full rounded-xl border border-white/5 bg-black/15 px-3 py-2 text-left text-sm transition hover:border-vura-500/40 hover:bg-white/[0.04]"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <b className="text-white/85">{n.title}</b>
                      <span className="text-[11px] text-white/35">{formatWhen(n.created_at)}</span>
                    </div>
                    <span className="mt-0.5 block line-clamp-2 text-xs text-white/45">{n.message}</span>
                    {n.severity === 'critical' ? (
                      <span className="mt-1 inline-block rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-300">critical</span>
                    ) : null}
                    <span className="mt-1 block text-[10px] text-vura-300">Tap to read full alert</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {/* Job detail sheet with tool activity */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={() => setSelectedJob(null)}>
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#12151f] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Job detail</p>
                <h3 className="text-lg font-black text-white">{selectedJob.agent_id}</h3>
              </div>
              <button type="button" className="rounded-lg px-2 py-1 text-sm text-white/50 hover:bg-white/5" onClick={() => setSelectedJob(null)}>Close</button>
            </div>
            <dl className="mt-3 space-y-2 text-sm">
              <div><dt className="text-[10px] uppercase text-white/35">Status</dt><dd className={statusColor(selectedJob.status)}>{selectedJob.status}</dd></div>
              <div><dt className="text-[10px] uppercase text-white/35">When</dt><dd className="text-white/70">{formatWhen(selectedJob.completed_at || selectedJob.started_at) || '—'} {selectedJob.started_at ? `(started ${new Date(selectedJob.started_at).toLocaleString()})` : ''}</dd></div>
              <div><dt className="text-[10px] uppercase text-white/35">Task</dt><dd className="text-white/80">{selectedJob.task}</dd></div>
              {selectedJob.provider ? <div><dt className="text-[10px] uppercase text-white/35">Model</dt><dd className="text-white/70">{selectedJob.provider}{selectedJob.model ? ` / ${selectedJob.model}` : ''}</dd></div> : null}
              {selectedJob.error ? <div><dt className="text-[10px] uppercase text-white/35">Error</dt><dd className="text-red-300">{selectedJob.error}</dd></div> : null}
              <div><dt className="text-[10px] uppercase text-white/35">Run ID</dt><dd className="break-all font-mono text-[11px] text-white/40">{selectedJob.id}</dd></div>
            </dl>
            {selectedJob.result != null && (
              <div className="mt-4">
                <p className="text-[10px] font-bold uppercase text-white/35">Result / what the agent found</p>
                <pre className="mt-2 max-h-64 overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 text-[11px] leading-relaxed text-white/70 whitespace-pre-wrap">
                  {typeof selectedJob.result === 'string' ? selectedJob.result : JSON.stringify(selectedJob.result, null, 2)}
                </pre>
              </div>
            )}
            {selectedJobEvents.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-bold uppercase text-white/35">Tool activity</p>
                <ul className="mt-2 space-y-1.5">
                  {selectedJobEvents.map((ev) => (
                    <li key={ev.id} className="rounded-lg border border-white/5 bg-black/25 px-3 py-2 text-[11px]">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className={`font-bold ${ev.event_type === 'tool.failed' ? 'text-red-300' : ev.risk === 'write' || ev.risk === 'destructive' ? 'text-violet-300' : 'text-sky-300'}`}>
                          {ev.event_type}
                        </span>
                        {ev.tool_name ? <span className="font-mono text-white/80">{ev.tool_name}</span> : null}
                        {ev.risk ? <span className="text-white/35">{ev.risk}</span> : null}
                        <span className="ml-auto text-white/35">{formatWhen(ev.created_at)}</span>
                      </div>
                      {ev.error ? <p className="mt-0.5 text-red-300/90">{ev.error}</p> : null}
                      {ev.input != null && ev.event_type === 'tool.started' ? (
                        <p className="mt-0.5 truncate font-mono text-white/40">{JSON.stringify(ev.input)}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-4 text-xs text-white/40">
              Schedules run in the background on Fly. Approvals appear when an agent proposes a write action — you decide.
            </p>
          </div>
        </div>
      )}

      {/* Mission detail sheet */}
      {selectedMission && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={() => setSelectedMission(null)}>
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#12151f] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Growth mission</p>
                <h3 className="text-lg font-black text-white">{selectedMission.mission.goal}</h3>
              </div>
              <button type="button" className="rounded-lg px-2 py-1 text-sm text-white/50 hover:bg-white/5" onClick={() => setSelectedMission(null)}>Close</button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              <span className={`font-bold ${MISSION_STATUS_COLOR[selectedMission.mission.status] || 'text-white'}`}>
                {selectedMission.mission.status}
              </span>
              {selectedMission.mission.correlation_id ? (
                <span className="text-white/35">· {selectedMission.mission.correlation_id}</span>
              ) : null}
              {selectedMission.mission.policy_level != null ? (
                <span className="text-white/35">· policy L{selectedMission.mission.policy_level}</span>
              ) : null}
            </div>
            <ul className="mt-4 space-y-2">
              {selectedMission.steps.map((st) => (
                <li key={st.id} className="rounded-xl border border-white/5 bg-black/25 p-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                    <span className={`font-bold ${STEP_STATUS_COLOR[st.status] || 'text-white'}`}>{st.status}</span>
                    <span className="font-bold text-white/85">{st.step_key}</span>
                    {st.agent_id ? <span className="text-white/40">· {st.agent_id}</span> : <span className="text-white/40">· human gate</span>}
                    {st.attempts != null && st.attempts > 0 ? (
                      <span className="text-white/30">· attempt {st.attempts}/{st.max_attempts ?? 3}</span>
                    ) : null}
                  </div>
                  {st.error ? <p className="mt-1 text-xs text-red-300/90">{st.error}</p> : null}
                  {st.status === 'awaiting_approval' ? (
                    <p className="mt-1 text-xs text-violet-300">
                      Awaiting your approval in Command Center. No autonomous publish or write happens.
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-white/40">
              Missions terminate at a human approval gate. Retries are bounded by each step's attempt budget; nothing is
              published or written autonomously.
            </p>
          </div>
        </div>
      )}

      {selectedNotif && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={() => setSelectedNotif(null)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#12151f] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between gap-2">
              <h3 className="text-lg font-black text-white">{selectedNotif.title}</h3>
              <button type="button" className="text-sm text-white/50" onClick={() => setSelectedNotif(null)}>Close</button>
            </div>
            <p className="mt-1 text-[11px] text-white/40">{formatWhen(selectedNotif.created_at)} {selectedNotif.agent_id ? `· ${selectedNotif.agent_id}` : ''}</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-white/75">{selectedNotif.message}</p>
            <p className="mt-4 text-xs text-white/40">Tip: open Opportunities to act on trend ideas. Product research alerts mean a brief is ready — review before listing.</p>
          </div>
        </div>
      )}
    </div>
  );
}
