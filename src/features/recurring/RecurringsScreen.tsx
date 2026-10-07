import { useMemo, useState } from 'react';
import { Screen } from '../../components/Screen';
import { Badge, Button, Card, EmptyState, IconButton, List, Money, Section } from '../../components/ui';
import { useData } from '../../hooks/useData';
import { formatShortDate, inDaysLabel } from '../../lib/dates';
import { frequencyShort, monthlyEquivalent, nextOccurrence } from '../../lib/recurrence';
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
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[19px]"
        style={{ background: `${cat?.color ?? '#5B5BD6'}26`, opacity: r.active ? 1 : 0.5 }}
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
          className={`block text-[16px] font-semibold ${r.type === 'income' ? 'text-positive' : ''}`}
        />
        <span className="text-[12px] text-label-2">{frequencyShort(r.frequency, r.interval)}</span>
      </span>
    </button>
  );
}

const GROUPS: { type: TxType; title: string }[] = [
  { type: 'income', title: 'Revenus' },
  { type: 'expense', title: 'Charges fixes' },
  { type: 'transfer', title: 'Virements automatiques' },
];

export function RecurringsScreen() {
  const { recurrings } = useData();
  const [selected, setSelected] = useState<Recurring | null>(null);
  const [draft, setDraft] = useState<RecurringDraft | null>(null);
  const open = !!selected || !!draft;

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const r of recurrings) {
      if (!r.active) continue;
      const m = monthlyEquivalent(r.amount, r.frequency, r.interval);
      if (r.type === 'income') income += m;
      else if (r.type === 'expense') expense += m;
    }
    return { income, expense };
  }, [recurrings]);

  return (
    <Screen title="Récurrentes" back actions={<IconButton icon="plus" label="Nouvelle récurrence" onClick={() => setDraft({})} />}>
      <Card className="mb-5 grid grid-cols-3 divide-x divide-separator p-3 text-center">
        <div>
          <p className="text-[12px] text-label-2">Revenus fixes</p>
          <Money cents={totals.income} compact className="text-[17px] font-semibold text-positive" />
        </div>
        <div>
          <p className="text-[12px] text-label-2">Charges fixes</p>
          <Money cents={-totals.expense} compact className="text-[17px] font-semibold" />
        </div>
        <div>
          <p className="text-[12px] text-label-2">Différence</p>
          <Money cents={totals.income - totals.expense} compact colored className="text-[17px] font-semibold" />
        </div>
      </Card>
      <p className="-mt-3 mb-5 px-1 text-[12px] text-label-2">Montants ramenés au mois (hebdo × 52 / 12, annuel / 12).</p>

      {recurrings.length === 0 ? (
        <EmptyState
          icon="repeat"
          title="Aucune opération récurrente"
          text="Ajoute ton loyer, tes aides (APL, bourse), ton salaire ou le virement de tes parents : ils seront ajoutés automatiquement chaque mois."
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
          const items = recurrings.filter((r) => r.type === type).sort((a, b) => Number(b.active) - Number(a.active) || b.amount - a.amount);
          if (!items.length) return null;
          return (
            <Section key={type} title={title}>
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
        Les échéances sont ajoutées automatiquement à l'ouverture de l'appli, le jour J. Tu peux sauter une échéance (mois sans APL, loyer
        offert…) en touchant la récurrence.
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
