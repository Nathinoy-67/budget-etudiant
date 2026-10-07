import { Suspense, lazy, useEffect, useState, type ComponentType } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useNav, type RouteName, type TabId } from '../stores/nav';
import { TabBar } from '../components/TabBar';
import { Toaster, ConfirmHost } from '../components/Overlays';
import { TransactionSheet } from '../features/transactions/TransactionSheet';
import { Dashboard } from '../features/dashboard/Dashboard';
import { TransactionsScreen } from '../features/transactions/TransactionsScreen';
import { MoreScreen } from '../features/more/MoreScreen';
import { AccountsScreen, AccountDetailScreen } from '../features/accounts/AccountsScreen';
import { BudgetsScreen } from '../features/budgets/BudgetsScreen';
import { RecurringsScreen } from '../features/recurring/RecurringsScreen';
import { SubscriptionsScreen } from '../features/recurring/SubscriptionsScreen';
import { GoalsScreen, GoalDetailScreen } from '../features/goals/GoalsScreen';
import { SharedScreen, GroupDetailScreen } from '../features/shared/SharedScreen';
import { CategoriesScreen } from '../features/categories/CategoriesScreen';
import { QuickAddsScreen } from '../features/quickadds/QuickAddsScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';

// Écrans lourds (Recharts) chargés à la demande
const StatsScreen = lazy(() => import('../features/stats/StatsScreen'));
const SimulatorScreen = lazy(() => import('../features/simulator/SimulatorScreen'));

const SCREENS: Record<RouteName, ComponentType<{ params?: Record<string, string> }>> = {
  home: Dashboard,
  transactions: TransactionsScreen,
  stats: StatsScreen,
  more: MoreScreen,
  accounts: AccountsScreen,
  account: AccountDetailScreen,
  budgets: BudgetsScreen,
  recurrings: RecurringsScreen,
  subscriptions: SubscriptionsScreen,
  goals: GoalsScreen,
  goal: GoalDetailScreen,
  shared: SharedScreen,
  group: GroupDetailScreen,
  simulator: SimulatorScreen,
  categories: CategoriesScreen,
  quickadds: QuickAddsScreen,
  settings: SettingsScreen,
};

function Loading() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-bg">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-fill-2 border-t-accent" role="status" aria-label="Chargement" />
    </div>
  );
}

function TabStack({ tab, active }: { tab: TabId; active: boolean }) {
  const stack = useNav((s) => s.stacks[tab]);
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ display: active ? 'block' : 'none' }}>
      <AnimatePresence initial={false}>
        {stack.map((route, i) => {
          const Comp = SCREENS[route.name];
          const top = i === stack.length - 1;
          return (
            <motion.div
              key={route.key}
              className="absolute inset-0 bg-bg"
              style={{ zIndex: i, boxShadow: i > 0 ? '-8px 0 24px rgba(0,0,0,0.08)' : undefined }}
              initial={i === 0 ? false : { x: '100%' }}
              animate={{ x: top ? 0 : '-28%' }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.36 }}
              aria-hidden={!top}
              inert={!top}
            >
              <Suspense fallback={<Loading />}>
                <Comp params={route.params} />
              </Suspense>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function Shell() {
  const tab = useNav((s) => s.tab);
  // Les onglets visités restent montés : on garde leur défilement et leur état
  const [visited, setVisited] = useState<Set<TabId>>(() => new Set([tab]));
  useEffect(() => {
    setVisited((v) => (v.has(tab) ? v : new Set([...v, tab])));
  }, [tab]);

  return (
    <div className="fixed inset-0 bg-bg">
      <main className="absolute inset-0">
        {(['home', 'transactions', 'stats', 'more'] as TabId[]).map((t) =>
          visited.has(t) ? <TabStack key={t} tab={t} active={t === tab} /> : null,
        )}
      </main>
      <TabBar />
      <TransactionSheet />
      <Toaster />
      <ConfirmHost />
    </div>
  );
}
