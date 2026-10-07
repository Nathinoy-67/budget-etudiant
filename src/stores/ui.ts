import { create } from 'zustand';
import type { ID, ISODate, Transaction, TxType } from '../types';

// ---------- Feuille d'ajout / édition de transaction ----------

export interface TxSheetPreset {
  type?: TxType;
  amount?: number;
  categoryId?: ID | null;
  accountId?: ID | null;
  toAccountId?: ID | null;
  date?: ISODate;
  note?: string;
}

interface TxSheetState {
  open: boolean;
  editing: Transaction | null;
  preset: TxSheetPreset | null;
  openNew: (preset?: TxSheetPreset) => void;
  openEdit: (t: Transaction) => void;
  close: () => void;
}

export const useTxSheet = create<TxSheetState>((set) => ({
  open: false,
  editing: null,
  preset: null,
  openNew: (preset) => set({ open: true, editing: null, preset: preset ?? null }),
  openEdit: (t) => set({ open: true, editing: t, preset: null }),
  close: () => set({ open: false }),
}));

// ---------- Toasts (avec action "Annuler") ----------

export interface Toast {
  id: number;
  message: string;
  tone?: 'default' | 'success' | 'warning' | 'error';
  action?: { label: string; onClick: () => void };
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  show: (t: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => void;
  dismiss: (id: number) => void;
}

let toastId = 0;
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  show: (t) => {
    const id = ++toastId;
    const duration = t.duration ?? (t.action ? 5000 : 2500);
    set({ toasts: [...get().toasts.slice(-2), { ...t, id, duration }] });
    setTimeout(() => get().dismiss(id), duration);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}));

export const toast = (message: string, opts: Partial<Omit<Toast, 'id' | 'message'>> = {}) =>
  useToasts.getState().show({ message, ...opts });

// ---------- Verrouillage ----------

interface LockState {
  locked: boolean;
  setLocked: (v: boolean) => void;
}
export const useLock = create<LockState>((set) => ({ locked: true, setLocked: (locked) => set({ locked }) }));
