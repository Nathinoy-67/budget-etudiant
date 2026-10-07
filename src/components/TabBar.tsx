import { useNav, type TabId } from '../stores/nav';
import { useTxSheet } from '../stores/ui';
import { haptic } from '../lib/haptics';
import { Icon, type IconName } from './Icon';

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Accueil', icon: 'home' },
  { id: 'transactions', label: 'Opérations', icon: 'list' },
  { id: 'stats', label: 'Stats', icon: 'chart' },
  { id: 'more', label: 'Plus', icon: 'grid' },
];

export function TabBar() {
  const { tab, setTab } = useNav();
  const openNew = useTxSheet((s) => s.openNew);

  const item = (t: (typeof TABS)[number]) => (
    <button
      key={t.id}
      onClick={() => {
        haptic('light');
        setTab(t.id);
      }}
      aria-current={tab === t.id ? 'page' : undefined}
      className={`flex min-h-[49px] flex-1 flex-col items-center justify-center gap-0.5 ${tab === t.id ? 'text-accent' : 'text-label-3'}`}
    >
      <Icon name={t.icon} size={24} strokeWidth={tab === t.id ? 2.3 : 1.9} />
      <span className="text-[10px] font-medium">{t.label}</span>
    </button>
  );

  return (
    <nav
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-separator bg-[var(--tabbar)] backdrop-blur-xl"
      aria-label="Navigation principale"
    >
      <div className="mx-auto flex max-w-xl items-stretch px-1">
        {item(TABS[0])}
        {item(TABS[1])}
        <div className="flex flex-1 items-center justify-center">
          <button
            onClick={() => {
              haptic('medium');
              openNew();
            }}
            aria-label="Ajouter une opération"
            className="pressable -mt-5 flex h-[58px] w-[58px] items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-[var(--accent-soft)] ring-4 ring-bg"
          >
            <Icon name="plus" size={30} strokeWidth={2.6} />
          </button>
        </div>
        {item(TABS[2])}
        {item(TABS[3])}
      </div>
    </nav>
  );
}
