import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, XCircle } from 'lucide-react';

type Toast = { id: number; title: string; description?: string; kind: 'success' | 'error' | 'info' };

const ToastContext = createContext<{ push: (toast: Omit<Toast, 'id'>) => void } | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    counter.current += 1;
    const id = counter.current;
    setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-center gap-2 sm:bottom-6 sm:left-auto sm:right-6 sm:items-end">
        {toasts.map((toast) => (
          <div key={toast.id} role="status" className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-white/10 bg-[#1A1A2C]/95 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur-md">
            <span className={`mt-0.5 shrink-0 ${toast.kind === 'success' ? 'text-emerald-400' : toast.kind === 'error' ? 'text-red-400' : 'text-vura-300'}`}>
              {toast.kind === 'success' ? <CheckCircle2 size={18} /> : toast.kind === 'error' ? <XCircle size={18} /> : <Info size={18} />}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#F2F1FA]">{toast.title}</p>
              {toast.description && <p className="mt-0.5 text-xs leading-5 text-[#A9A9C2]">{toast.description}</p>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
