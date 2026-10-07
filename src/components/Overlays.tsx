import { create } from 'zustand';
import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { useToasts } from '../stores/ui';
import { haptic } from '../lib/haptics';

// ---------- Toasts ----------

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 92px)' }}
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: 'spring', damping: 26, stiffness: 400 }}
            className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-[#1c1c1e]/95 px-4 py-3 text-white shadow-xl backdrop-blur dark:bg-[#3a3a3c]/95"
            role="status"
          >
            <span className="flex-1 text-[15px]">
              {t.tone === 'warning' && '⚠️ '}
              {t.tone === 'error' && '⛔ '}
              {t.tone === 'success' && '✅ '}
              {t.message}
            </span>
            {t.action && (
              <button
                className="min-h-11 shrink-0 px-2 text-[15px] font-semibold text-[#a5a1ff]"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

// ---------- Confirmation (feuille d'action iOS) ----------

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
}

interface ConfirmState {
  current: (ConfirmOptions & { resolve: (v: boolean) => void }) | null;
}

const useConfirmStore = create<ConfirmState>(() => ({ current: null }));

/** Affiche une demande de confirmation et attend la réponse. */
export function confirmAction(opts: ConfirmOptions): Promise<boolean> {
  haptic(opts.destructive ? 'warning' : 'light');
  return new Promise((resolve) => useConfirmStore.setState({ current: { ...opts, resolve } }));
}

export function ConfirmHost() {
  const current = useConfirmStore((s) => s.current);
  const close = (v: boolean) => {
    current?.resolve(v);
    useConfirmStore.setState({ current: null });
  };
  return createPortal(
    <AnimatePresence>
      {current && (
        <div className="fixed inset-0 z-[70]">
          <motion.div
            className="absolute inset-0 bg-[var(--backdrop)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => close(false)}
          />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-label={current.title}
            className="absolute inset-x-2 mx-auto max-w-md"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}
            initial={{ y: '120%' }}
            animate={{ y: 0 }}
            exit={{ y: '120%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 400 }}
          >
            <div className="overflow-hidden rounded-[14px] bg-elevated/95 backdrop-blur-xl">
              <div className="px-4 py-3.5 text-center">
                <p className="text-[13px] font-semibold text-label-2">{current.title}</p>
                {current.message && <p className="mt-1 text-[13px] text-label-2">{current.message}</p>}
              </div>
              <button
                className={`min-h-14 w-full border-t border-separator text-[20px] ${current.destructive ? 'text-negative' : 'text-accent'}`}
                onClick={() => close(true)}
                autoFocus
              >
                {current.confirmLabel ?? 'Confirmer'}
              </button>
            </div>
            <button
              className="mt-2 min-h-14 w-full rounded-[14px] bg-elevated text-[20px] font-semibold text-accent"
              onClick={() => close(false)}
            >
              Annuler
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
