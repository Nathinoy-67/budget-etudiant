import { useNav, type TabId } from '../stores/nav';
import { useTxSheet } from '../stores/ui';
import { haptic } from '../lib/haptics';
import { Icon, type IconName } from './Icon';

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Accueil', icon: 'home' },
  { id: 'operations', label: 'Opérations', icon: 'list' },
  { id: 'stats', label: 'Analyse', icon: 'chart' },
  { id: 'settings', label: 'Réglages', icon: 'gear' },
];

/** Barre du bas flottante en verre dépoli : Accueil · Opérations · + · Analyse · Réglages. */
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
        className="flex min-h-[52px] min-w-0 flex-1 items-center justify-center"
      >
        <span
          className={`flex h-[52px] w-full max-w-[78px] flex-col items-center justify-center gap-[3px] rounded-[24px] transition-colors duration-200 ${
            active ? 'bg-[var(--tab-active)] text-accent' : 'text-label-2'
          }`}
        >
          <Icon name={t.icon} size={22} strokeWidth={active ? 2.2 : 1.9} />
          <span className="text-[10px] font-semibold">{t.label}</span>
        </span>
      </button>
    );
  };

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(10px,calc(env(safe-area-inset-bottom)-12px))]"
      aria-label="Navigation principale"
    >
      <div className="glass shadow-float pointer-events-auto mx-auto flex max-w-md items-center rounded-[32px] border border-[var(--glass-border)] p-1.5">
        {item(TABS[0])}
        {item(TABS[1])}
        <div className="flex flex-1 items-center justify-center">
          <button
            onClick={() => {
              haptic('medium');
              openNew();
            }}
            aria-label="Ajouter une opération"
            className="pressable bg-brand shadow-brand flex h-[50px] w-[50px] items-center justify-center rounded-full text-white"
          >
            <Icon name="plus" size={26} strokeWidth={2.5} />
          </button>
        </div>
        {item(TABS[2])}
        {item(TABS[3])}
      </div>
    </nav>
  );
}
