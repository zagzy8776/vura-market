import { useCallback, useEffect, useState } from 'react';
import { Activity, Bot, Loader2, Play, RefreshCw, Shield, Clock } from 'lucide-react';
import { authHeaders } from '@/lib/session';
import { StudioGrowthMission } from './StudioGrowthMission';

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

function formatWhen(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = Date.now();
  const diff = Math.round((now - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const b = (await r.json().catch(() => ({}))) as {
    runId?: string;
    status?: string;
    message?: string;
    error?: string;
  };
  if (!r.ok) throw new Error(b.error || `Start failed (${r.status})`);
  return b;
}

export default function StudioAgents() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [approvals, setApprovals] = useState<unknown[]>([]);
  const [memory, setMemory] = useState<unknown[]>([]);
  const [schedules, setSchedules] = useState<unknown[]>([]);
  const [opportunities, setOpportunities] = useState<unknown[]>([]);
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');
  const [starting, setStarting] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>(['phones', 'Phone Accessories']);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedNotif, setSelectedNotif] = useState<Notif | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [j, a, m, s, o, n] = await Promise.all([
        getApi<{ jobs: Job[] }>('agent-jobs&limit=50'),
        getApi<{ approvals: unknown[] }>('agent-approvals'),
        getApi<{ memory: unknown[] }>('agent-memory'),
        getApi<{ schedules: unknown[] }>('agent-schedules'),
        getApi<{ opportunities: unknown[] }>('agent-opportunities&limit=20'),
        getApi<{ notifications: Notif[] }>('agent-notifications&limit=20'),
      ]);
      setJobs(j.jobs || []);
      setApprovals(a.approvals || []);
      setMemory(m.memory || []);
      setSchedules(s.schedules || []);
      setOpportunities(o.opportunities || []);
      setNotifications(n.notifications || []);
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
    if (!active) return;
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [jobs, load]);

  const byAgent = (id: string) => jobs.filter((j) => j.agent_id === id);
  const running = jobs.filter((j) => j.status === 'running' || j.status === 'queued');
  const failed = jobs.filter((j) => j.status === 'failed');

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
    startAgent(
      'trend-intelligence',
      `Scan Nigeria demand for: ${categories.join(', ') || 'general retail'}`,
      { categories: categories.length ? categories : ['phones'] },
    );

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

      <StudioGrowthMission categories={categories} onBanner={setBanner} onError={setError} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Running / queued', running.length],
          ['Failed (recent)', failed.length],
          ['Opportunities', opportunities.length],
          ['Pending approvals', approvals.length],
        ].map(([label, n]) => (
          <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/35">{label}</div>
            <div className="mt-1 text-2xl font-black text-white">{n}</div>
          </div>
        ))}
      </div>

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
                  Last:{' '}
                  <span className={statusColor(last.status)}>{last.status}</span>
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
                    onClick={() => setSelectedJob(j)}
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
              <Shield size={14} /> Approvals & schedules
            </h2>
            <p className="mt-2 text-sm text-white/50">
              Approvals in queue: {approvals.length}. Schedules: {schedules.length}. Memory entries: {memory.length}.
            </p>
            <ul className="mt-3 space-y-1 text-[11px] text-white/40">
              {(schedules as Array<{ id: string; agent_id: string; interval_minutes: number; enabled: boolean }>).map((s) => (
                <li key={s.id}>
                  {s.id} → {s.agent_id} every {s.interval_minutes}m {s.enabled ? '' : '(disabled)'}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white/40">Alerts & history</h2>
            <ul className="mt-3 space-y-2">
              {notifications.length === 0 && <li className="text-sm text-white/40">No alerts yet.</li>}
              {notifications.slice(0, 15).map((n) => (
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
                    <span className="mt-1 text-[10px] text-vura-300">Tap to read full alert →</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={() => setSelectedJob(null)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#12151f] p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Job detail</p>
                <h3 className="text-lg font-black text-white">{selectedJob.agent_id}</h3>
              </div>
              <button type="button" className="rounded-lg px-2 py-1 text-sm text-white/50 hover:bg-white/5" onClick={() => setSelectedJob(null)}>Close</button>
            </div>
            <dl className="mt-3 space-y-2 text-sm">
              <div><dt className="text-[10px] uppercase text-white/35">Status</dt><dd className={statusColor(selectedJob.status)}>{selectedJob.status}</dd></div>
              <div><dt className="text-[10px] uppercase text-white/35">When</dt><dd className="text-white/70">{formatWhen(selectedJob.completed_at || selectedJob.started_at) || '—'}</dd></div>
              <div><dt className="text-[10px] uppercase text-white/35">Task</dt><dd className="text-white/80">{selectedJob.task}</dd></div>
              {selectedJob.error ? <div><dt className="text-[10px] uppercase text-white/35">Error</dt><dd className="text-red-300">{selectedJob.error}</dd></div> : null}
              <div><dt className="text-[10px] uppercase text-white/35">Run ID</dt><dd className="break-all font-mono text-[11px] text-white/40">{selectedJob.id}</dd></div>
            </dl>
            {selectedJob.result != null && (
              <div className="mt-4">
                <p className="text-[10px] font-bold uppercase text-white/35">Result</p>
                <pre className="mt-2 max-h-64 overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 text-[11px] text-white/70 whitespace-pre-wrap">
{typeof selectedJob.result === 'string' ? selectedJob.result : JSON.stringify(selectedJob.result, null, 2)}
                </pre>
              </div>
            )}
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
            <p className="mt-3 whitespace-pre-wrap text-sm text-white/75">{selectedNotif.message}</p>
          </div>
        </div>
      )}
    </div>
  );
}
