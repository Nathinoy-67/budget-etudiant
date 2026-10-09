import { create } from 'zustand';

/** Quatre onglets : accueil, opérations, analyse, réglages (le + est au centre de la barre). */
export type TabId = 'home' | 'operations' | 'stats' | 'settings';

export type RouteName = 'home' | 'operations' | 'stats' | 'settings' | 'search' | 'recurrings' | 'categories' | 'simulator' | 'applepay' | 'import';

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
  /** Ouvre un écran dans l'onglet courant. */
  open: (name: RouteName, params?: Record<string, string>) => void;
}

let k = 0;
const route = (name: RouteName, params?: Record<string, string>): Route => ({ key: `${name}-${k++}`, name, params });

export const useNav = create<NavState>((set, get) => ({
  tab: 'home',
  stacks: {
    home: [route('home')],
    operations: [route('operations')],
    stats: [route('stats')],
    settings: [route('settings')],
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
  open: (name, params) => get().push(name, params),
}));
