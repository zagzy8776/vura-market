import { useCallback, useEffect, useState } from 'react';
import { Activity, Bot, Loader2, RefreshCw, Shield } from 'lucide-react';

type Job = {
  id: string;
  agent_id: string;
  task: string;
  status: string;
  attempts?: number;
  error?: string;
  provider?: string;
  model?: string;
  started_at?: string;
  completed_at?: string;
};

const AGENTS = [
  { id: 'trend-intelligence', label: 'Trend' },
  { id: 'product-intelligence', label: 'Product' },
  { id: 'marketing-intelligence', label: 'Marketing' },
  { id: 'sales', label: 'Sales' },
  { id: 'operations', label: 'Operations' },
  { id: 'engineering', label: 'Engineering' },
];

async function api<T>(resource: string): Promise<T> {
  const [res, ...rest] = resource.split('&');
  let url = `/api/admin?resource=${encodeURIComponent(res)}`;
  if (rest.length) url += `&${rest.join('&')}`;
  const r = await fetch(url, { credentials: 'include' });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((b as { error?: string })?.error || `Failed (${r.status})`);
  return b as T;
}

export default function StudioAgents() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [approvals, setApprovals] = useState<unknown[]>([]);
  const [memory, setMemory] = useState<unknown[]>([]);
  const [schedules, setSchedules] = useState<unknown[]>([]);
  const [opportunities, setOpportunities] = useState<unknown[]>([]);
  const [notifications, setNotifications] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [j, a, m, s, o, n] = await Promise.all([
        api<{ jobs: Job[] }>('agent-jobs&limit=40'),
        api<{ approvals: unknown[] }>('agent-approvals'),
        api<{ memory: unknown[] }>('agent-memory'),
        api<{ schedules: unknown[] }>('agent-schedules'),
        api<{ opportunities: unknown[] }>('agent-opportunities&limit=20'),
        api<{ notifications: unknown[] }>('agent-notifications&limit=15'),
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

  const byAgent = (id: string) => jobs.filter((j) => j.agent_id === id);
  const running = jobs.filter((j) => j.status === 'running' || j.status === 'queued');
  const failed = jobs.filter((j) => j.status === 'failed');

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
            Coordinated AI commerce team. Long jobs run on Fly. Humans approve consequential writes.
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Running / queued', running.length],
          ['Failed (recent list)', failed.length],
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
            <div key={a.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-2">
                <b className="text-sm text-white">{a.label}</b>
                <Activity size={14} className="text-white/30" />
              </div>
              <p className="mt-1 text-[11px] text-white/40">{a.id}</p>
              <p className="mt-3 text-xs text-white/55">
                Jobs in view: {list.length}
                {last ? ` · last ${last.status}` : ' · no runs yet'}
              </p>
              {last?.error && <p className="mt-1 truncate text-[11px] text-red-300/80">{last.error}</p>}
            </div>
          );
        })}
      </div>

      {loading ? (
        <div className="grid place-items-center py-16 text-white/40">
          <Loader2 className="animate-spin" size={28} />
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white/40">Recent jobs</h2>
            <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {jobs.slice(0, 25).map((j) => (
                <li key={j.id} className="rounded-xl border border-white/5 bg-black/20 px-3 py-2 text-xs">
                  <span className="font-bold text-white/80">{j.agent_id}</span>
                  <span className="text-white/35"> · {j.status}</span>
                  <span className="mt-0.5 block truncate text-white/50">{j.task}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/40">
              <Shield size={14} /> Approvals & schedules
            </h2>
            <p className="mt-2 text-sm text-white/50">
              Approvals in queue: {approvals.length}. Schedules registered: {schedules.length}. Memory
              entries: {memory.length}.
            </p>
            <ul className="mt-3 space-y-1 text-[11px] text-white/40">
              {(schedules as Array<{ id: string; agent_id: string; interval_minutes: number; enabled: boolean }>).map(
                (s) => (
                  <li key={s.id}>
                    {s.id} → {s.agent_id} every {s.interval_minutes}m {s.enabled ? '' : '(disabled)'}
                  </li>
                ),
              )}
            </ul>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white/40">Notifications</h2>
            <ul className="mt-3 space-y-2">
              {(notifications as Array<{ id: string; title: string; message: string }>).slice(0, 8).map((n) => (
                <li key={n.id} className="text-sm">
                  <b className="text-white/80">{n.title}</b>
                  <span className="mt-0.5 block text-xs text-white/40">{n.message}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
