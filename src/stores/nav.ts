import { create } from 'zustand';

export type TabId = 'home' | 'transactions' | 'stats' | 'more';

export type RouteName =
  | 'home'
  | 'transactions'
  | 'stats'
  | 'more'
  | 'accounts'
  | 'account'
  | 'budgets'
  | 'recurrings'
  | 'subscriptions'
  | 'goals'
  | 'goal'
  | 'shared'
  | 'group'
  | 'simulator'
  | 'categories'
  | 'quickadds'
  | 'settings';

export interface Route {
  key: string;
  name: RouteName;
  params?: Record<string, string>;
}

interface NavState {
  tab: TabId;
  stacks: Record<TabId, Route[]>;
  setTab: (tab: TabId) => void;
  push: (name: RouteName, params?: Record<string, string>) => void;
  pop: () => void;
  /** Ouvre un écran depuis n'importe où (bascule sur l'onglet "Plus" si besoin). */
  open: (name: RouteName, params?: Record<string, string>) => void;
}

let k = 0;
const route = (name: RouteName, params?: Record<string, string>): Route => ({ key: `${name}-${k++}`, name, params });

export const useNav = create<NavState>((set, get) => ({
  tab: 'home',
  stacks: {
    home: [route('home')],
    transactions: [route('transactions')],
    stats: [route('stats')],
    more: [route('more')],
  },
  setTab: (tab) => {
    const { tab: current, stacks } = get();
    // Re-taper l'onglet actif revient à sa racine (comme sur iOS)
    if (tab === current && stacks[tab].length > 1) set({ stacks: { ...stacks, [tab]: [stacks[tab][0]] } });
    else set({ tab });
  },
  push: (name, params) => {
    const { tab, stacks } = get();
    set({ stacks: { ...stacks, [tab]: [...stacks[tab], route(name, params)] } });
  },
  pop: () => {
    const { tab, stacks } = get();
    if (stacks[tab].length <= 1) return;
    set({ stacks: { ...stacks, [tab]: stacks[tab].slice(0, -1) } });
  },
  open: (name, params) => {
    const { tab, stacks } = get();
    if (tab === 'home' || tab === 'more') {
      set({ stacks: { ...stacks, [tab]: [...stacks[tab], route(name, params)] } });
    } else {
      set({ tab: 'more', stacks: { ...stacks, more: [stacks.more[0], route(name, params)] } });
    }
  },
}));
