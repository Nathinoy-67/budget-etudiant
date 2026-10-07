import { Suspense, lazy, useEffect, useState, type ComponentType } from 'react';
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'motion/react';
import { useNav, type Route, type RouteName, type TabId } from '../stores/nav';
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

/** Écran de la pile : glisser depuis le bord gauche pour revenir (comme sur iOS). */
function StackScreen({ route, index, top }: { route: Route; index: number; top: boolean }) {
  const Comp = SCREENS[route.name];
  const controls = useDragControls();
  const pop = useNav((s) => s.pop);
  const canSwipe = top && index > 0;
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 110 || info.velocity.x > 600) pop();
  };
  return (
    <motion.div
      className="absolute inset-0 bg-bg"
      style={{ zIndex: index, boxShadow: index > 0 ? '-8px 0 24px rgba(0,0,0,0.08)' : undefined }}
      initial={index === 0 ? false : { x: '100%' }}
      animate={{ x: top ? 0 : '-28%' }}
      exit={{ x: '100%' }}
      transition={{ type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.36 }}
      drag={canSwipe ? 'x' : false}
      dragListener={false}
      dragControls={controls}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0, right: 1 }}
      dragSnapToOrigin
      onDragEnd={onDragEnd}
      aria-hidden={!top}
      inert={!top}
    >
      <Suspense fallback={<Loading />}>
        <Comp params={route.params} />
      </Suspense>
      {canSwipe && (
        <div className="absolute bottom-0 left-0 z-30 w-4 touch-none" style={{ top: "calc(env(safe-area-inset-top) + 44px)" }} onPointerDown={(e) => controls.start(e)} aria-hidden="true" />
      )}
    </motion.div>
  );
}

function TabStack({ tab, active }: { tab: TabId; active: boolean }) {
  const stack = useNav((s) => s.stacks[tab]);
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ display: active ? 'block' : 'none' }}>
      <AnimatePresence initial={false}>
        {stack.map((route, i) => (
          <StackScreen key={route.key} route={route} index={i} top={i === stack.length - 1} />
        ))}
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
