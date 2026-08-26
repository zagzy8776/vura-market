import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, Star, X, XCircle } from 'lucide-react';
import { money } from '@/lib/money';
import { discountPercent } from '../lib/availability';
import type { Availability } from '../lib/availability';

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
};

const buttonVariants: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-vura-500 text-white hover:bg-vura-600 active:bg-vura-700 shadow-lg shadow-vura-500/25 disabled:shadow-none',
  secondary: 'border border-white/15 bg-white/[0.06] text-hi hover:bg-white/[0.12]',
  ghost: 'text-mid hover:bg-white/[0.07] hover:text-hi',
  danger: 'bg-red-500/90 text-white hover:bg-red-500',
};
const buttonSizes = { sm: 'h-9 px-3.5 text-sm', md: 'h-11 px-5 text-sm', lg: 'h-12 px-6 text-base' };

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={cx('inline-flex items-center justify-center gap-2 rounded-xl font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vura-400 disabled:cursor-not-allowed disabled:opacity-50', buttonVariants[variant], buttonSizes[size], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  );
}

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} className={cx('grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-mid transition hover:bg-white/[0.1] hover:text-hi', className)} {...rest}>
      {children}
    </button>
  );
}

export function Field({ label, hint, error, required, children, htmlFor }: { label: string; hint?: string; error?: string; required?: boolean; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-hi">
        {label}
        {required && <span className="ml-0.5 text-vura-400" aria-hidden>*</span>}
      </label>
      {children}
      {error ? <p role="alert" className="mt-1.5 text-xs font-semibold text-red-400">{error}</p> : hint ? <p className="mt-1.5 text-xs text-low">{hint}</p> : null}
    </div>
  );
}

const inputBase = 'w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-hi placeholder:text-low outline-none transition focus:border-vura-500 focus:bg-white/[0.07]';

export function Input({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={cx(inputBase, invalid && 'border-red-400/60', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputBase, 'appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%23A9A9C2%27 stroke-width=%272%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")] bg-[right_1rem_center] bg-no-repeat pr-10 [&>*]:bg-[#151522]', className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} className={cx(inputBase, 'resize-y', className)} {...rest} />;
}

export function Badge({ tone = 'neutral', children }: { tone?: Availability['tone']; children: ReactNode }) {
  const tones: Record<Availability['tone'], string> = {
    success: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20',
    warning: 'bg-amber-400/10 text-amber-300 border-amber-400/20',
    danger: 'bg-red-400/10 text-red-300 border-red-400/20',
    neutral: 'bg-white/[0.06] text-mid border-white/10',
    brand: 'bg-vura-500/15 text-vura-300 border-vura-500/30',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold leading-none', tones[tone])}>{children}</span>;
}

export function Price({ priceKobo, compareAtKobo, size = 'md' }: { priceKobo: number; compareAtKobo?: number | null; size?: 'sm' | 'md' | 'lg' }) {
  const discount = discountPercent(priceKobo, compareAtKobo);
  const sizes = { sm: 'text-sm', md: 'text-lg', lg: 'text-3xl' };
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className={cx('font-display font-bold tracking-tight text-hi', sizes[size])}>{money(priceKobo)}</span>
      {discount != null && compareAtKobo != null && (
        <>
          <s className="text-xs font-semibold text-low">{money(compareAtKobo)}</s>
          <Badge tone="danger">-{discount}%</Badge>
        </>
      )}
    </span>
  );
}

export function Rating({ value, count, size = 14 }: { value: number; count?: number; size?: number }) {
  if (!value || value <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-300">
      <Star size={size} fill="currentColor" aria-hidden />
      {value.toFixed(1)}
      {typeof count === 'number' && count > 0 && <span className="font-medium text-low">({count})</span>}
      <span className="sr-only">rated {value.toFixed(1)} out of 5</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-xl bg-white/[0.06]', className)} aria-hidden />;
}

export function ProductCardSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <Skeleton className="aspect-square w-full rounded-xl" />
      <div className="space-y-2 p-2">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-5 w-1/2" />
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 bg-surface/60 px-6 py-16 text-center">
      {icon && <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-vura-500/10 text-vura-300">{icon}</div>}
      <h2 className="font-display text-xl font-bold text-hi">{title}</h2>
      {description && <p className="mt-2 max-w-sm text-sm leading-6 text-mid">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', description = 'An unexpected error occurred. Please try again.', onRetry }: { title?: string; description?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center rounded-2xl border border-red-400/20 bg-red-500/[0.04] px-6 py-16 text-center">
      <XCircle size={40} className="mb-4 text-red-400" aria-hidden />
      <h2 className="font-display text-xl font-bold text-hi">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-mid">{description}</p>
      {onRetry && <Button variant="secondary" className="mt-6" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function useEscapeKey(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [active, onEscape]);
}

function trapFocus(container: HTMLElement) {
  const selector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
  const first = container.querySelectorAll<HTMLElement>(selector)[0];
  first?.focus();
  const handler = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const items = [...container.querySelectorAll<HTMLElement>(selector)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const active = document.activeElement as HTMLElement | null;
    const index = items.indexOf(active as HTMLElement);
    e.preventDefault();
    if (e.shiftKey) (index <= 0 ? items[items.length - 1] : items[index - 1]).focus();
    else (index === items.length - 1 || index === -1 ? items[0] : items[index + 1]).focus();
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEscapeKey(open, onClose);
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const release = panelRef.current ? trapFocus(panelRef.current) : undefined;
    return () => {
      document.body.style.overflow = prevOverflow;
      release?.();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className={cx('max-h-[92vh] w-full overflow-auto rounded-t-3xl border border-white/10 bg-elevated shadow-2xl sm:rounded-3xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/8 bg-elevated/95 px-5 py-4 backdrop-blur">
          <h2 id={titleId} className="font-display text-lg font-bold text-hi">{title}</h2>
          <IconButton label="Close dialog" onClick={onClose}><X size={18} /></IconButton>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children, side = 'left' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; side?: 'left' | 'bottom' }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEscapeKey(open, onClose);
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const release = panelRef.current ? trapFocus(panelRef.current) : undefined;
    return () => {
      document.body.style.overflow = prevOverflow;
      release?.();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      {side === 'left' ? (
        <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex h-full w-[86vw] max-w-sm flex-col border-r border-white/10 bg-elevated shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
            <h2 id={titleId} className="font-display text-lg font-bold text-hi">{title}</h2>
            <IconButton label="Close menu" onClick={onClose}><X size={18} /></IconButton>
          </div>
          <div className="flex-1 overflow-auto p-5">{children}</div>
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-0 max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
          <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[85vh] flex-col rounded-t-3xl border-t border-white/10 bg-elevated shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <h2 id={titleId} className="font-display text-lg font-bold text-hi">{title}</h2>
              <IconButton label="Close filters" onClick={onClose}><X size={18} /></IconButton>
            </div>
            <div className="flex-1 overflow-auto p-5">{children}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export function QuantityStepper({ value, min = 1, max, onChange, small }: { value: number; min?: number; max: number; onChange: (next: number) => void; small?: boolean }) {
  const btn = cx('grid place-items-center text-hi transition hover:text-vura-300 disabled:opacity-40', small ? 'h-7 w-7' : 'h-9 w-9');
  return (
    <div className={cx('inline-flex items-center rounded-xl border border-white/12 bg-white/[0.04]', small ? 'gap-1 p-0.5' : 'gap-1.5 p-1')} role="group" aria-label="Quantity">
      <button type="button" className={btn} aria-label="Decrease quantity" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}><Minus size={small ? 13 : 15} /></button>
      <span className={cx('min-w-8 text-center font-bold tabular-nums text-hi', small ? 'text-xs' : 'text-sm')} aria-live="polite">{value}</span>
      <button type="button" className={btn} aria-label="Increase quantity" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}><Plus size={small ? 13 : 15} /></button>
    </div>
  );
}

export function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-low">
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
            {item.href ? (
              <a href={item.href} onClick={(e) => { e.preventDefault(); window.history.pushState({}, '', item.href); window.dispatchEvent(new PopStateEvent('popstate')); }} className="transition hover:text-vura-300">{item.label}</a>
            ) : (
              <span aria-current="page" className="text-mid">{item.label}</span>
            )}
            {i < items.length - 1 && <ChevronRight size={12} aria-hidden />}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  if (pages <= 1) return null;
  const window_ = 2;
  const numbers: number[] = [];
  for (let n = Math.max(1, page - window_); n <= Math.min(pages, page + window_); n += 1) numbers.push(n);
  return (
    <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
      <IconButton label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)} className="disabled:opacity-40"><ChevronLeft size={18} /></IconButton>
      {numbers[0] !== 1 && <>
        <PageButton page={1} current={page} onChange={onChange} />
        <span className="px-1 text-low">…</span>
      </>}
      {numbers.map((n) => <PageButton key={n} page={n} current={page} onChange={onChange} />)}
      {numbers[numbers.length - 1] !== pages && <>
        <span className="px-1 text-low">…</span>
        <PageButton page={pages} current={page} onChange={onChange} />
      </>}
      <IconButton label="Next page" disabled={page >= pages} onClick={() => onChange(page + 1)} className="disabled:opacity-40"><ChevronRight size={18} /></IconButton>
    </nav>
  );
}

function PageButton({ page, current, onChange }: { page: number; current: number; onChange: (page: number) => void }) {
  const active = page === current;
  return (
    <button
      onClick={() => onChange(page)}
      aria-current={active ? 'page' : undefined}
      className={cx('grid h-10 min-w-10 place-items-center rounded-xl px-3 text-sm font-bold transition', active ? 'bg-vura-500 text-white shadow-lg shadow-vura-500/25' : 'border border-white/10 bg-white/[0.04] text-mid hover:bg-white/[0.1] hover:text-hi')}
    >
      {page}
    </button>
  );
}

export function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.16em] text-vura-300">{eyebrow}</p>}
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-hi sm:text-3xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Accordion({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const openRef = useRef<HTMLDivElement>(null);
  return (
    <details className="group rounded-2xl border border-white/8 bg-surface/60 open:bg-surface" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-bold text-hi marker:hidden [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronRight size={17} className="text-low transition group-open:rotate-90" aria-hidden />
      </summary>
      <div ref={openRef} className="px-5 pb-5 text-sm leading-7 text-mid">{children}</div>
    </details>
  );
}
