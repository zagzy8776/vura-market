import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Eye,
  Filter,
  Loader2,
  Radar,
  RefreshCw,
  Search,
  X,
  XCircle,
} from 'lucide-react';

type OpportunityStatus = 'new' | 'watching' | 'investigating' | 'approved' | 'dismissed';

type Opportunity = {
  id: string;
  agentId: string;
  name: string;
  category: string;
  signal: string;
  score: number | null;
  source: string | null;
  evidence: string | null;
  status: OpportunityStatus;
  createdAt: string;
};

type ParsedEvidence = {
  evidence?: string;
  product?: string;
  confidence?: number;
  trendScore?: number;
  commercialScore?: number;
  urgency?: string;
  region?: string;
  timeWindow?: string;
  recommendation?: string;
  sources?: string[];
  evidenceClass?: string;
};

type AgentNotification = {
  id: string;
  title: string;
  message: string;
  severity: string;
  agent_id?: string;
  opportunity_id?: string;
  created_at: string;
};

const STATUSES: OpportunityStatus[] = ['new', 'watching', 'investigating', 'approved', 'dismissed'];

const STATUS_STYLE: Record<OpportunityStatus, string> = {
  new: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  watching: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  investigating: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  approved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  dismissed: 'bg-white/10 text-white/45 border-white/15',
};

const WORKFLOW: { id: OpportunityStatus; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'watching', label: 'Watching' },
  { id: 'investigating', label: 'Investigating' },
  { id: 'approved', label: 'Approved' },
];

/** Consolidated admin API: /api/admin?resource=… */
async function api<T>(resourceWithQuery: string, init?: RequestInit): Promise<T> {
  const [resource, ...rest] = resourceWithQuery.split('&');
  let url = `/api/admin?resource=${encodeURIComponent(resource)}`;
  if (rest.length) url += `&${rest.join('&')}`;
  const r = await fetch(url, { credentials: 'include', ...init });
  const b = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 202) throw new Error((b as { error?: string })?.error || `Request failed (${r.status})`);
  return b as T;
}

function parseEvidence(raw: string | null): ParsedEvidence {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as ParsedEvidence;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    /* plain text from older rows */
  }
  return { evidence: raw };
}

function sourceList(op: Opportunity, parsed: ParsedEvidence): string[] {
  if (parsed.sources?.length) return parsed.sources.filter((s) => typeof s === 'string' && s.startsWith('http'));
  if (!op.source) return [];
  return op.source
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('http'));
}

function scoreColor(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return 'text-white/40';
  if (n >= 85) return 'text-emerald-300';
  if (n >= 70) return 'text-amber-300';
  return 'text-white/70';
}

export default function StudioOpportunities() {
  const [rows, setRows] = useState<Opportunity[]>([]);
  const [alerts, setAlerts] = useState<AgentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [status, setStatus] = useState<OpportunityStatus | 'all'>('all');
  const [category, setCategory] = useState('all');
  const [urgency, setUrgency] = useState('all');
  const [region, setRegion] = useState('all');
  const [minScore, setMinScore] = useState(0);
  const [minConfidence, setMinConfidence] = useState(0);
  const [sort, setSort] = useState<'newest' | 'score' | 'commercial' | 'confidence'>('newest');
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const [productBusy, setProductBusy] = useState(false);
  const [productReport, setProductReport] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [opp, notif] = await Promise.all([
        api<{ opportunities: Opportunity[] }>('agent-opportunities&limit=100'),
        api<{ notifications: AgentNotification[] }>('agent-notifications&limit=20'),
      ]);
      setRows(opp.opportunities || []);
      setAlerts(notif.notifications || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load opportunities');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(() => {
    const set = new Set(rows.map((r) => r.category).filter(Boolean));
    return ['all', ...[...set].sort()];
  }, [rows]);

  const regions = useMemo(() => {
    const set = new Set(rows.map((r) => parseEvidence(r.evidence).region || 'Nigeria').filter(Boolean));
    return ['all', ...[...set].sort()];
  }, [rows]);

  const enriched = useMemo(() => {
    return rows.map((op) => {
      const parsed = parseEvidence(op.evidence);
      const confidence = parsed.confidence ?? op.score ?? 0;
      const trendScore = parsed.trendScore ?? op.score ?? 0;
      const commercialScore = parsed.commercialScore ?? op.score ?? 0;
      const urg = (parsed.urgency || 'medium').toLowerCase();
      const reg = parsed.region || 'Nigeria';
      return { op, parsed, confidence, trendScore, commercialScore, urg, reg };
    });
  }, [rows]);

  const filtered = useMemo(() => {
    let list = enriched.filter(({ op, parsed, confidence, trendScore, commercialScore, urg, reg }) => {
      if (status !== 'all' && op.status !== status) return false;
      if (category !== 'all' && op.category !== category) return false;
      if (urgency !== 'all' && urg !== urgency) return false;
      if (region !== 'all' && reg !== region) return false;
      const scoreGate = Math.max(trendScore, commercialScore, op.score ?? 0);
      if (scoreGate < minScore) return false;
      if (confidence < minConfidence) return false;
      if (q.trim()) {
        const hay = `${op.name} ${op.category} ${op.signal} ${parsed.recommendation || ''}`.toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sort === 'newest') return +new Date(b.op.createdAt) - +new Date(a.op.createdAt);
      if (sort === 'score') return b.trendScore - a.trendScore;
      if (sort === 'commercial') return b.commercialScore - a.commercialScore;
      return b.confidence - a.confidence;
    });
    return list;
  }, [enriched, status, category, urgency, region, minScore, minConfidence, q, sort]);

  const selected = useMemo(() => {
    if (selectedId) {
      const hit = filtered.find((x) => x.op.id === selectedId);
      if (hit) return hit;
    }
    return filtered[0] || null;
  }, [filtered, selectedId]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const s of STATUSES) c[s] = rows.filter((r) => r.status === s).length;
    return c;
  }, [rows]);

  const clearFilters = () => {
    setStatus('all');
    setCategory('all');
    setUrgency('all');
    setRegion('all');
    setMinScore(0);
    setMinConfidence(0);
    setSort('newest');
    setQ('');
  };

  const setStatusFor = async (id: string, next: OpportunityStatus) => {
    setBusyId(id);
    setError('');
    try {
      await api('agent-opportunities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: next }),
      });
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: next } : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update status');
    } finally {
      setBusyId(null);
    }
  };

  const selectRow = (id: string) => {
    setSelectedId(id);
    setMobileShowDetail(true);
    setProductReport(null);
  };

  const runProductIntel = async (opportunityId: string, productName: string, category: string) => {
    setProductBusy(true);
    setError('');
    setProductReport(null);
    try {
      const res = await api<{
        report?: Record<string, unknown>;
        note?: string;
        mode?: string;
        runId?: string;
        status?: string;
      }>('agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: 'product-intelligence',
          task: `Investigate ${productName}`,
          opportunityId,
          productName,
          category,
        }),
      });
      if (res.mode === 'queued' && res.runId) {
        setProductReport({
          status: 'queued',
          runId: res.runId,
          message: 'Job queued on Fly worker. Poll run status or refresh notifications shortly.',
        });
        // light poll
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          const job = await api<{ run?: { status?: string; result?: Record<string, unknown>; error?: string } }>(
            `agents&runId=${res.runId}`,
          );
          const st = job.run?.status;
          if (st === 'completed') {
            setProductReport(job.run?.result || { status: 'completed' });
            return;
          }
          if (st === 'failed') {
            setError(job.run?.error || 'Product intelligence job failed');
            return;
          }
        }
        setError('Job still running — check Opportunities notifications later.');
        return;
      }
      if (res.report) setProductReport(res.report);
      else setError(res.note || 'Product intelligence returned no report');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Product intelligence failed');
    } finally {
      setProductBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-vura-300">
            <Radar size={18} />
            <span className="text-xs font-bold uppercase tracking-wider">Agents</span>
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-white md:text-3xl">Opportunities</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-white/45">
            Human review of trend signals. Workflow:{' '}
            <span className="text-white/70">NEW → WATCHING → INVESTIGATING → APPROVED / DISMISSED</span>.
            Approving does <b className="text-white/80">not</b> publish products — Product Intelligence comes next.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-transparent px-4 py-2.5 text-sm font-bold text-white/60 hover:bg-white/5 hover:text-white"
          >
            <X size={16} />
            Clear filters
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Pipeline legend */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/35">Pipeline</span>
        {WORKFLOW.map((step, i) => (
          <span key={step.id} className="flex items-center gap-2">
            {i > 0 && <span className="text-white/20">→</span>}
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLE[step.id]}`}>
              {step.label}
              {counts[step.id] != null ? ` · ${counts[step.id]}` : ''}
            </span>
          </span>
        ))}
        <span className="text-white/20">/</span>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLE.dismissed}`}>
          Dismissed · {counts.dismissed ?? 0}
        </span>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap gap-2">
        {(['all', ...STATUSES] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold capitalize ${
              status === s
                ? 'border-vura-400/50 bg-vura-500/20 text-vura-200'
                : 'border-white/10 bg-white/[0.03] text-white/50 hover:text-white'
            }`}
          >
            {s} · {counts[s] ?? 0}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/40">
          <Filter size={14} /> Filters
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs text-white/40">
            Search
            <div className="relative mt-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name, category, signal…"
                className="w-full rounded-xl border border-white/10 bg-[#0b0d17] py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-vura-500/50"
              />
            </div>
          </label>
          <label className="block text-xs text-white/40">
            Category
            <div className="relative mt-1">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full appearance-none rounded-xl border border-white/10 bg-[#0b0d17] py-2.5 pl-3 pr-9 text-sm text-white outline-none focus:border-vura-500/50"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c === 'all' ? 'All categories' : c}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/30" />
            </div>
          </label>
          <label className="block text-xs text-white/40">
            Urgency
            <div className="relative mt-1">
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value)}
                className="w-full appearance-none rounded-xl border border-white/10 bg-[#0b0d17] py-2.5 pl-3 pr-9 text-sm text-white outline-none focus:border-vura-500/50"
              >
                {['all', 'high', 'medium', 'low'].map((u) => (
                  <option key={u} value={u}>
                    {u === 'all' ? 'All urgency' : u}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/30" />
            </div>
          </label>
          <label className="block text-xs text-white/40">
            Region
            <div className="relative mt-1">
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full appearance-none rounded-xl border border-white/10 bg-[#0b0d17] py-2.5 pl-3 pr-9 text-sm text-white outline-none focus:border-vura-500/50"
              >
                {regions.map((r) => (
                  <option key={r} value={r}>
                    {r === 'all' ? 'All regions' : r}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/30" />
            </div>
          </label>
          <label className="block text-xs text-white/40">
            Min score ({minScore})
            <input
              type="range"
              min={0}
              max={100}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="mt-3 w-full accent-vura-500"
            />
          </label>
          <label className="block text-xs text-white/40">
            Min confidence ({minConfidence})
            <input
              type="range"
              min={0}
              max={100}
              value={minConfidence}
              onChange={(e) => setMinConfidence(Number(e.target.value))}
              className="mt-3 w-full accent-vura-500"
            />
          </label>
          <label className="block text-xs text-white/40 sm:col-span-2">
            Sort
            <div className="relative mt-1">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                className="w-full appearance-none rounded-xl border border-white/10 bg-[#0b0d17] py-2.5 pl-3 pr-9 text-sm text-white outline-none focus:border-vura-500/50"
              >
                <option value="newest">Newest</option>
                <option value="score">Highest trend score</option>
                <option value="commercial">Highest commercial potential</option>
                <option value="confidence">Highest confidence</option>
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/30" />
            </div>
          </label>
        </div>
        <p className="mt-3 text-[11px] text-white/35">
          Showing <b className="text-white/55">{filtered.length}</b> of {rows.length} opportunities
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <div className="grid place-items-center rounded-2xl border border-white/10 bg-white/[0.02] py-20 text-white/40">
          <Loader2 className="animate-spin" size={28} />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          {/* List — hide on mobile when detail open */}
          <div className={`space-y-2 lg:col-span-2 ${mobileShowDetail && selected ? 'hidden lg:block' : ''}`}>
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-16 text-center text-sm text-white/40">
                No opportunities yet. Open Command Center → Start Trend scan, wait a few minutes, then refresh here.
              </div>
            ) : (
              filtered.map(({ op, trendScore, commercialScore, confidence, urg }) => (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => selectRow(op.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selected?.op.id === op.id
                      ? 'border-vura-400/40 bg-vura-500/10'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <b className="text-sm font-bold text-white">{op.name}</b>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[op.status]}`}>
                      {op.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-white/40">{op.category}</p>
                  <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-semibold">
                    <span className={scoreColor(trendScore)}>Trend {trendScore}</span>
                    <span className={scoreColor(commercialScore)}>Commercial {commercialScore}</span>
                    <span className={scoreColor(confidence)}>Conf {confidence}</span>
                    <span className="uppercase text-white/35">{urg}</span>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Detail */}
          <div className={`lg:col-span-3 ${!mobileShowDetail && selected ? 'hidden lg:block' : ''}`}>
            {!selected ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-16 text-center text-sm text-white/40">
                Select an opportunity to review evidence and decide.
              </div>
            ) : (
              <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
                <button
                  type="button"
                  className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-white/50 hover:text-white lg:hidden"
                  onClick={() => setMobileShowDetail(false)}
                >
                  <ArrowLeft size={14} /> Back to list
                </button>

                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-black text-white">{selected.op.name}</h2>
                    <p className="mt-1 text-sm text-white/45">
                      {selected.op.category}
                      {selected.parsed.product ? ` · ${selected.parsed.product}` : ''}
                    </p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${STATUS_STYLE[selected.op.status]}`}>
                    {selected.op.status}
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ['Trend score', selected.trendScore],
                    ['Commercial', selected.commercialScore],
                    ['Confidence', selected.confidence],
                    ['Urgency', selected.urg],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-xl border border-white/10 bg-[#0b0d17] px-3 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-white/35">{label}</div>
                      <div
                        className={`mt-1 text-lg font-black capitalize ${
                          typeof value === 'number' ? scoreColor(value) : 'text-white'
                        }`}
                      >
                        {value}
                      </div>
                    </div>
                  ))}
                </div>

                <dl className="mt-5 space-y-3 text-sm">
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wider text-white/35">Signal</dt>
                    <dd className="mt-1 text-white/80">{selected.op.signal}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wider text-white/35">Evidence</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-white/70">
                      {selected.parsed.evidence || '—'}
                    </dd>
                    {selected.parsed.evidenceClass && (
                      <p className="mt-1 text-[11px] font-semibold text-emerald-400/80">{selected.parsed.evidenceClass}</p>
                    )}
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wider text-white/35">Recommendation</dt>
                    <dd className="mt-1 text-white/80">
                      {selected.parsed.recommendation || 'Investigate before any listing decision.'}
                    </dd>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-white/45">
                    <span>Region: {selected.reg}</span>
                    <span>Window: {selected.parsed.timeWindow || '—'}</span>
                    <span>Agent: {selected.op.agentId}</span>
                    <span>{new Date(selected.op.createdAt).toLocaleString()}</span>
                  </div>
                </dl>

                <div className="mt-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white/35">Sources</h3>
                  <ul className="mt-2 space-y-2">
                    {sourceList(selected.op, selected.parsed).length === 0 ? (
                      <li className="text-sm text-white/40">No source URLs recorded.</li>
                    ) : (
                      sourceList(selected.op, selected.parsed).map((url) => (
                        <li key={url}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 break-all text-sm font-semibold text-vura-300 hover:text-vura-200"
                          >
                            <ExternalLink size={14} className="shrink-0" />
                            {url}
                          </a>
                        </li>
                      ))
                    )}
                  </ul>
                </div>

                <div className="mt-6 border-t border-white/10 pt-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-white/35">Product Intelligence</p>
                  <button
                    type="button"
                    disabled={productBusy}
                    onClick={() =>
                      void runProductIntel(selected.op.id, selected.op.name, selected.op.category)
                    }
                    className="mt-3 inline-flex items-center gap-2 rounded-xl border border-vura-400/40 bg-vura-500/15 px-4 py-2.5 text-xs font-bold text-vura-200 hover:bg-vura-500/25 disabled:opacity-50"
                  >
                    {productBusy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    Investigate with Product AI
                  </button>
                  <p className="mt-2 text-[11px] text-white/35">
                    Deep research for this opportunity. Does not publish a product.
                  </p>
                  {productReport && (
                    <div className="mt-4 max-h-80 overflow-y-auto rounded-xl border border-white/10 bg-[#0b0d17] p-4 text-xs text-white/70">
                      <pre className="whitespace-pre-wrap font-mono leading-5">
                        {JSON.stringify(productReport, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>

                <div className="mt-6 border-t border-white/10 pt-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-white/35">Decision workflow</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(
                      [
                        ['watching', 'Watch', Eye],
                        ['investigating', 'Investigate', Search],
                        ['approved', 'Approve', CheckCircle2],
                        ['dismissed', 'Dismiss', XCircle],
                        ['new', 'Reset to new', AlertTriangle],
                      ] as const
                    ).map(([st, label, Icon]) => (
                      <button
                        key={st}
                        type="button"
                        disabled={busyId === selected.op.id || selected.op.status === st}
                        onClick={() => void setStatusFor(selected.op.id, st)}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-40 ${
                          selected.op.status === st
                            ? STATUS_STYLE[st]
                            : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                        }`}
                      >
                        {busyId === selected.op.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Icon size={14} />
                        )}
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] leading-5 text-white/35">
                    Approve means you chose this for deeper Product Intelligence later — it does not publish a product.
                  </p>
                </div>
              </article>
            )}
          </div>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white/40">Recent agent alerts</h3>
          <ul className="mt-3 space-y-2">
            {alerts.slice(0, 8).map((n) => (
              <li key={n.id} className="rounded-xl border border-white/5 bg-black/20 px-3 py-2 text-sm">
                <span className="font-bold text-white/80">{n.title}</span>
                <span className="mt-0.5 block text-xs text-white/40">{n.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
