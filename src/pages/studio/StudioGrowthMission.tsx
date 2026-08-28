import { useCallback, useEffect, useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { authHeaders } from '@/lib/session';

type MissionRow = Record<string, unknown>;
type MissionDetail = { mission: MissionRow; steps: MissionRow[] };

function statusColor(status: string): string {
  if (status === 'completed') return 'text-emerald-300';
  if (status === 'failed') return 'text-red-300';
  if (status === 'awaiting_approval') return 'text-amber-200';
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

export function StudioGrowthMission({
  categories,
  onBanner,
  onError,
}: {
  categories: string[];
  onBanner: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [starting, setStarting] = useState(false);
  const [selected, setSelected] = useState<MissionDetail | null>(null);

  const load = useCallback(async () => {
    try {
      const mi = await getApi<{ missions: MissionRow[] }>('agent-missions&limit=15');
      setMissions(mi.missions || []);
    } catch {
      /* missions table may not exist until migration 033 */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startGrowthMission = async () => {
    setStarting(true);
    onError('');
    try {
      const r = await fetch('/api/admin?resource=agent-missions', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          goal: `Find and prepare profitable products for: ${categories.join(', ') || 'Nigeria retail'}`,
          missionType: 'growth',
          categories: categories.length ? categories : ['phones'],
          productName: categories[0] || 'retail product',
        }),
      });
      const b = (await r.json().catch(() => ({}))) as {
        missionId?: string;
        correlationId?: string;
        error?: string;
        message?: string;
      };
      if (!r.ok) throw new Error(b.error || `Mission failed (${r.status})`);
      onBanner(
        b.missionId
          ? `Growth mission started · ${b.correlationId || b.missionId.slice(0, 8)} — parallel agents → listing draft → your approval.`
          : b.message || 'Mission started.',
      );
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not start mission');
    } finally {
      setStarting(false);
    }
  };

  const openMission = async (id: string) => {
    try {
      const detail = await getApi<MissionDetail>(`agent-missions&missionId=${encodeURIComponent(id)}`);
      setSelected({ mission: detail.mission, steps: detail.steps || [] });
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not load mission');
    }
  };

  return (
    <>
      <section className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent p-4 md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-black uppercase tracking-wider text-emerald-200">Start Growth Mission</h2>
            <p className="mt-1 text-sm text-white/50">
              Product, Marketing, Sales and Operations run in parallel, then reconcile into a listing draft and{' '}
              <b className="text-white/70">stop for your approval</b>. Nothing publishes automatically.
            </p>
            <p className="mt-2 text-[11px] text-white/35">
              Uses categories selected above. Reconcile / listing_draft are Phase-1 scaffolding — real generators come next.
            </p>
          </div>
          <button
            type="button"
            disabled={starting || categories.length === 0}
            onClick={() => void startGrowthMission()}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-black text-black shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            {starting ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
            Start Growth Mission
          </button>
        </div>
        {missions.length > 0 && (
          <ul className="mt-4 space-y-2 border-t border-white/10 pt-4">
            {missions.slice(0, 8).map((mi) => (
              <li key={String(mi.id)}>
                <button
                  type="button"
                  onClick={() => void openMission(String(mi.id))}
                  className="w-full rounded-xl border border-white/5 bg-black/20 px-3 py-2.5 text-left text-xs transition hover:border-emerald-500/40"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-white/85">{String(mi.correlation_id || mi.id).slice(0, 28)}</span>
                    <span className={statusColor(String(mi.status))}>{String(mi.status)}</span>
                    <span className="truncate text-white/45">{String(mi.goal || '').slice(0, 72)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={() => setSelected(null)}>
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#12151f] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Growth Mission</p>
                <h3 className="text-lg font-black text-white">{String(selected.mission.correlation_id || selected.mission.id)}</h3>
              </div>
              <button type="button" className="rounded-lg px-2 py-1 text-sm text-white/50 hover:bg-white/5" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
            <p className="mt-2 text-sm text-white/60">{String(selected.mission.goal || '')}</p>
            <p className={`mt-1 text-xs font-bold ${statusColor(String(selected.mission.status))}`}>{String(selected.mission.status)}</p>
            <ul className="mt-4 space-y-2">
              {selected.steps.map((st) => (
                <li key={String(st.id)} className="rounded-xl border border-white/8 bg-black/25 px-3 py-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold uppercase tracking-wide text-white/80">{String(st.step_key)}</span>
                    <span className={statusColor(String(st.status))}>{String(st.status)}</span>
                    {st.agent_id ? <span className="text-white/35">· {String(st.agent_id)}</span> : null}
                  </div>
                  {st.error ? <p className="mt-1 text-red-300">{String(st.error)}</p> : null}
                  {st.result != null ? (
                    <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-black/40 p-2 text-[10px] text-white/55 whitespace-pre-wrap">
                      {typeof st.result === 'string' ? st.result : JSON.stringify(st.result, null, 2)}
                    </pre>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11px] text-white/40">
              Listing drafts require approval. No auto-publish, email, refund, or deploy from this mission.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
