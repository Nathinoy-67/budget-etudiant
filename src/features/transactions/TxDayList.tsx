import { useMemo } from 'react';
import { List, Money } from '../../components/ui';
import { relativeDayLabel } from '../../lib/dates';
import { TxRow } from './TxRow';
import type { ISODate, Transaction } from '../../types';

/** Opérations regroupées par jour (déjà triées de la plus récente à la plus ancienne). */
export function TxDayList({ transactions, today }: { transactions: Transaction[]; today: ISODate }) {
  const groups = useMemo(() => {
    const out: { date: ISODate; items: Transaction[]; spent: number }[] = [];
    for (const t of transactions) {
      const last = out[out.length - 1];
      if (last && last.date === t.date) {
        last.items.push(t);
        if (t.type === 'expense') last.spent += t.amount;
      } else out.push({ date: t.date, items: [t], spent: t.type === 'expense' ? t.amount : 0 });
    }
    return out;
  }, [transactions]);

  return (
    <>
      {groups.map((g) => (
        <section key={g.date} className="mb-6">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h3 className="text-[12px] font-semibold tracking-[0.06em] text-label-2 uppercase">{relativeDayLabel(g.date, today)}</h3>
            {g.spent > 0 && <Money cents={-g.spent} className="text-[13px] font-semibold text-negative" />}
          </div>
          <List inset={68}>
            {g.items.map((t) => (
              <TxRow key={t.id} tx={t} />
            ))}
          </List>
        </section>
      ))}
    </>
  );
}
