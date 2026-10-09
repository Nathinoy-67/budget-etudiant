import { useMemo, useState } from 'react';
import { Screen } from '../../components/Screen';
import { Badge, Button, Card, EmptyState, IconButton, List, Money, Section } from '../../components/ui';
import { useData } from '../../hooks/useData';
import { formatShortDate, inDaysLabel } from '../../lib/dates';
import { frequencyShort, monthlyEquivalent, nextOccurrence, yearlyEquivalent } from '../../lib/recurrence';
import { formatMoney } from '../../lib/money';
import { RecurringSheet, type RecurringDraft } from './RecurringSheet';
import type { Recurring, TxType } from '../../types';

export function RecurringRow({ r, onClick }: { r: Recurring; onClick: () => void }) {
  const { today, categoryById, accountById } = useData();
  const next = r.active ? nextOccurrence(r, today) : null;
  const cat = r.categoryId ? categoryById.get(r.categoryId) : undefined;
  const subtitle =
    r.type === 'transfer'
      ? `${accountById.get(r.accountId)?.name ?? '?'} → ${r.toAccountId ? (accountById.get(r.toAccountId)?.name ?? '?') : '?'}`
      : cat?.name;
  return (
    <button onClick={onClick} className="relative flex min-h-[60px] w-full items-center gap-3 px-4 py-2 text-left active:bg-fill">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-fill text-[19px]"
        style={{ opacity: r.active ? 1 : 0.5 }}
        aria-hidden="true"
      >
        {r.emoji ?? cat?.emoji ?? '🔁'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 truncate text-[16px] font-medium">
          <span className="truncate">{r.name}</span>
          {!r.active && <Badge>En pause</Badge>}
        </span>
        <span className="block truncate text-[13px] text-label-2">
          {next ? `${formatShortDate(next, today)} · ${inDaysLabel(next, today)}` : r.active ? 'Terminée' : subtitle}
          {next && subtitle ? ` · ${subtitle}` : ''}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <Money
          cents={r.type === 'expense' ? -r.amount : r.amount}
          sign={r.type === 'income'}
          className={`block text-[16px] font-semibold ${r.type === 'income' ? 'text-positive' : 'text-negative'}`}
        />
        <span className="text-[12px] text-label-2">{frequencyShort(r.frequency, r.interval)}</span>
      </span>
    </button>
  );
}

const GROUPS: { type: TxType; title: string }[] = [
  { type: 'income', title: 'Revenus' },
  { type: 'expense', title: 'Charges fixes' },
];

/** Revenus et charges fixes (salaire, aides, loyer, abonnements…), ajoutés automatiquement chaque mois. */
export function RecurringsScreen() {
  const { recurrings } = useData();
  const [selected, setSelected] = useState<Recurring | null>(null);
  const [draft, setDraft] = useState<RecurringDraft | null>(null);
  const open = !!selected || !!draft;
  const visible = recurrings.filter((r) => r.type !== 'transfer');

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    let subsMonthly = 0;
    let subsYearly = 0;
    for (const r of visible) {
      if (!r.active) continue;
      const m = monthlyEquivalent(r.amount, r.frequency, r.interval);
      if (r.type === 'income') income += m;
      else expense += m;
      if (r.isSubscription) {
        subsMonthly += m;
        subsYearly += yearlyEquivalent(r.amount, r.frequency, r.interval);
      }
    }
    return { income, expense, subsMonthly, subsYearly };
  }, [visible]);

  return (
    <Screen title="Revenus et charges" back actions={<IconButton icon="plus" label="Ajouter" onClick={() => setDraft({})} />}>
      <Card className="mb-7 grid grid-cols-3 divide-x divide-separator py-3.5 text-center">
        <div className="px-2">
          <p className="text-[12px] text-label-2">Revenus</p>
          <Money cents={totals.income} compact className="text-[16px] font-semibold text-positive" />
        </div>
        <div className="px-2">
          <p className="text-[12px] text-label-2">Charges</p>
          <Money cents={totals.expense} compact className="text-[16px] font-semibold text-negative" />
        </div>
        <div className="px-2">
          <p className="text-[12px] text-label-2">Reste</p>
          <Money cents={totals.income - totals.expense} compact colored className="text-[16px] font-semibold" />
        </div>
      </Card>

      {visible.length === 0 ? (
        <EmptyState
          icon="repeat"
          title="Rien pour l'instant"
          text="Ajoute ton salaire, tes aides (APL, bourse), ton loyer et tes abonnements : ils seront comptés automatiquement chaque mois."
          action={
            <div className="flex flex-col gap-2">
              <Button onClick={() => setDraft({ type: 'income', name: 'APL', emoji: '🏛️' })}>Ajouter un revenu</Button>
              <Button variant="secondary" onClick={() => setDraft({ type: 'expense', name: 'Loyer', emoji: '🏠' })}>
                Ajouter une charge
              </Button>
            </div>
          }
        />
      ) : (
        GROUPS.map(({ type, title }) => {
          const items = visible.filter((r) => r.type === type).sort((a, b) => Number(b.active) - Number(a.active) || b.amount - a.amount);
          if (!items.length) return null;
          return (
            <Section
              key={type}
              title={title}
              footer={
                type === 'expense' && totals.subsMonthly > 0
                  ? `Dont abonnements : ${formatMoney(totals.subsMonthly)} par mois, soit ${formatMoney(totals.subsYearly)} par an.`
                  : undefined
              }
            >
              <List>
                {items.map((r) => (
                  <RecurringRow key={r.id} r={r} onClick={() => setSelected(r)} />
                ))}
              </List>
            </Section>
          );
        })
      )}
      <p className="px-1 text-[13px] text-label-2">
        Ajoutés automatiquement le jour J. Touche une ligne pour la modifier, la mettre en pause ou sauter un mois.
      </p>

      <RecurringSheet
        open={open}
        recurring={selected}
        draft={draft}
        onClose={() => {
          setSelected(null);
          setDraft(null);
        }}
      />
    </Screen>
  );
}
