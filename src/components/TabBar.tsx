import { useNav, type TabId } from '../stores/nav';
import { useTxSheet } from '../stores/ui';
import { haptic } from '../lib/haptics';
import { Icon, type IconName } from './Icon';

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Accueil', icon: 'home' },
  { id: 'transactions', label: 'Opérations', icon: 'list' },
  { id: 'stats', label: 'Analyse', icon: 'chart' },
  { id: 'more', label: 'Plus', icon: 'grid' },
];

export function TabBar() {
  const { tab, setTab } = useNav();
  const openNew = useTxSheet((s) => s.openNew);

  const item = (t: (typeof TABS)[number]) => {
    const active = tab === t.id;
    return (
      <button
        key={t.id}
        onClick={() => {
          haptic('light');
          setTab(t.id);
        }}
        aria-current={active ? 'page' : undefined}
        aria-label={t.label}
        className={`flex min-h-[50px] flex-1 flex-col items-center justify-center gap-[3px] transition-colors ${active ? 'text-label' : 'text-label-3'}`}
      >
        <Icon name={t.icon} size={23} strokeWidth={active ? 2.2 : 1.8} />
        <span className={`text-[10px] ${active ? 'font-semibold' : 'font-medium'}`}>{t.label}</span>
      </button>
    );
  };

  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-separator bg-[var(--tabbar)] backdrop-blur-xl" aria-label="Navigation principale">
      <div className="mx-auto flex max-w-xl items-stretch px-2">
        {item(TABS[0])}
        {item(TABS[1])}
        <div className="flex flex-1 items-center justify-center">
          <button
            onClick={() => {
              haptic('medium');
              openNew();
            }}
            aria-label="Ajouter une opération"
            className="pressable flex h-11 w-11 items-center justify-center rounded-full bg-accent text-white"
          >
            <Icon name="plus" size={24} strokeWidth={2.4} />
          </button>
        </div>
        {item(TABS[2])}
        {item(TABS[3])}
      </div>
    </nav>
  );
}
