import { useMemo, useState } from 'react';
import { Screen } from '../../components/Screen';
import { Button, EmptyState, IconButton, List, Money, Segmented, TextInput, Field, Select } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { useData } from '../../hooks/useData';
import { useTxSheet } from '../../stores/ui';
import { addMonths, relativeDayLabel, shiftPeriod, toISO, parts, type Period } from '../../lib/dates';
import { parseAmount, centsToInput } from '../../lib/money';
import { TxRow } from './TxRow';
import type { ID, ISODate, Transaction, TxType } from '../../types';

type PeriodPreset = 'month' | 'prev' | '3m' | 'year' | 'all' | 'custom';

export interface TxFilters {
  preset: PeriodPreset;
  from: ISODate;
  to: ISODate;
  types: TxType[];
  categoryIds: ID[];
  accountId: ID | '';
  min: number | null;
  max: number | null;
}

const PRESET_LABEL: Record<PeriodPreset, string> = {
  month: 'Ce mois',
  prev: 'Mois dernier',
  '3m': '3 derniers mois',
  year: 'Cette année',
  all: 'Tout',
  custom: 'Personnalisée',
};

function presetRange(preset: PeriodPreset, period: Period, startDay: number, today: ISODate, f: TxFilters): Period | null {
  switch (preset) {
    case 'month':
      return period;
    case 'prev':
      return shiftPeriod(period, -1, startDay);
    case '3m':
      return { start: shiftPeriod(period, -2, startDay).start, end: period.end };
    case 'year':
      return { start: toISO(parts(today).y, 1, 1), end: toISO(parts(today).y, 12, 31) };
    case 'all':
      return null;
    case 'custom':
      return { start: f.from, end: f.to };
  }
}

const PAGE = 150;

export function TransactionsScreen() {
  const { transactions, categories, accounts, period, today, settings, categoryById } = useData();
  const openNew = useTxSheet((s) => s.openNew);
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [filters, setFilters] = useState<TxFilters>(() => ({
    preset: 'month',
    from: addMonths(today, -1),
    to: today,
    types: [],
    categoryIds: [],
    accountId: '',
    min: null,
    max: null,
  }));

  const range = presetRange(filters.preset, period, settings.monthStartDay, today, filters);
  const activeCount =
    (filters.preset !== 'month' ? 1 : 0) +
    (filters.types.length ? 1 : 0) +
    (filters.categoryIds.length ? 1 : 0) +
    (filters.accountId ? 1 : 0) +
    (filters.min != null || filters.max != null ? 1 : 0);

  const filtered = useMemo(() => {
    const q = query
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
    const qAmount = parseAmount(query);
    return transactions.filter((t) => {
      if (range && (t.date < range.start || t.date > range.end)) return false;
      if (filters.types.length && !filters.types.includes(t.type)) return false;
      if (filters.categoryIds.length && (!t.categoryId || !filters.categoryIds.includes(t.categoryId))) return false;
      if (filters.accountId && t.accountId !== filters.accountId && t.toAccountId !== filters.accountId) return false;
      if (filters.min != null && t.amount < filters.min) return false;
      if (filters.max != null && t.amount > filters.max) return false;
      if (q) {
        const cat = t.categoryId ? categoryById.get(t.categoryId)?.name ?? '' : '';
        const hay = `${t.note} ${cat}`
          .toLowerCase()
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '');
        if (!hay.includes(q) && !(qAmount != null && qAmount === t.amount)) return false;
      }
      return true;
    });
  }, [transactions, range?.start, range?.end, filters, query, categoryById]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => {
    let exp = 0;
    let inc = 0;
    for (const t of filtered) {
      if (t.type === 'expense') exp += t.amount;
      else if (t.type === 'income') inc += t.amount;
    }
    return { exp, inc };
  }, [filtered]);

  const groups = useMemo(() => {
    const out: { date: ISODate; items: Transaction[]; spent: number }[] = [];
    for (const t of filtered.slice(0, limit)) {
      const last = out[out.length - 1];
      if (last && last.date === t.date) {
        last.items.push(t);
        if (t.type === 'expense') last.spent += t.amount;
      } else out.push({ date: t.date, items: [t], spent: t.type === 'expense' ? t.amount : 0 });
    }
    return out;
  }, [filtered, limit]);

  return (
    <Screen
      title="Opérations"
      actions={
        <span className="relative">
          <IconButton icon="filter" label="Filtres" onClick={() => setShowFilters(true)} />
          {activeCount > 0 && (
            <span className="pointer-events-none absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-negative px-1 text-[10px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </span>
      }
      subtitle={range ? PRESET_LABEL[filters.preset] : 'Toutes les opérations'}
    >
      <div className="relative mb-3">
        <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-label-3" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher (note, catégorie, montant)"
          aria-label="Rechercher une opération"
          className="min-h-11 w-full rounded-xl bg-fill pr-3 pl-9 text-[16px] placeholder:text-label-3"
        />
      </div>

      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
        {(['month', 'prev', '3m', 'all'] as PeriodPreset[]).map((p) => (
          <button
            key={p}
            onClick={() => setFilters({ ...filters, preset: p })}
            aria-pressed={filters.preset === p}
            className={`min-h-9 shrink-0 rounded-full px-3.5 text-[14px] font-medium ${filters.preset === p ? 'bg-accent text-white' : 'bg-fill'}`}
          >
            {PRESET_LABEL[p]}
          </button>
        ))}
      </div>

      <div className="mb-4 flex gap-3 text-[14px]">
        <div className="flex-1 rounded-xl bg-card px-3 py-2">
          <p className="text-label-2">Dépenses</p>
          <Money cents={-totals.exp} className="text-[17px] font-semibold" />
        </div>
        <div className="flex-1 rounded-xl bg-card px-3 py-2">
          <p className="text-label-2">Revenus</p>
          <Money cents={totals.inc} sign className="text-[17px] font-semibold text-positive" />
        </div>
        <div className="flex-1 rounded-xl bg-card px-3 py-2">
          <p className="text-label-2">Nombre</p>
          <p className="text-[17px] font-semibold tabular">{filtered.length}</p>
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon="list"
          title={transactions.length ? 'Aucun résultat' : 'Aucune opération'}
          text={transactions.length ? 'Essaie une autre recherche ou une autre période.' : 'Ajoute ta première dépense avec le bouton +.'}
          action={!transactions.length && <Button onClick={() => openNew()}>Ajouter une dépense</Button>}
        />
      ) : (
        groups.map((g) => (
          <section key={g.date} className="mb-4">
            <div className="mb-1.5 flex items-baseline justify-between px-1">
              <h3 className="text-[15px] font-semibold">{relativeDayLabel(g.date, today)}</h3>
              {g.spent > 0 && <Money cents={-g.spent} className="text-[13px] text-label-2" />}
            </div>
            <List>
              {g.items.map((t) => (
                <TxRow key={t.id} tx={t} />
              ))}
            </List>
          </section>
        ))
      )}
      {filtered.length > limit && (
        <Button variant="secondary" block onClick={() => setLimit(limit + PAGE)}>
          Afficher plus ({filtered.length - limit} restantes)
        </Button>
      )}

      <FiltersSheet
        open={showFilters}
        onClose={() => setShowFilters(false)}
        filters={filters}
        onChange={(f) => {
          setFilters(f);
          setLimit(PAGE);
        }}
        categories={categories.filter((c) => !c.archived)}
        accounts={accounts}
      />
    </Screen>
  );
}

function FiltersSheet({
  open,
  onClose,
  filters,
  onChange,
  categories,
  accounts,
}: {
  open: boolean;
  onClose: () => void;
  filters: TxFilters;
  onChange: (f: TxFilters) => void;
  categories: ReturnType<typeof useData>['categories'];
  accounts: ReturnType<typeof useData>['accounts'];
}) {
  const [minStr, setMinStr] = useState(filters.min != null ? centsToInput(filters.min) : '');
  const [maxStr, setMaxStr] = useState(filters.max != null ? centsToInput(filters.max) : '');
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const reset = () => {
    setMinStr('');
    setMaxStr('');
    onChange({ ...filters, preset: 'month', types: [], categoryIds: [], accountId: '', min: null, max: null });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filtres"
      left={
        <button className="min-h-11 px-2 text-[17px] text-accent" onClick={reset}>
          Réinitialiser
        </button>
      }
      right={
        <button className="min-h-11 px-2 text-[17px] font-semibold text-accent" onClick={onClose}>
          OK
        </button>
      }
    >
      <Field label="Période">
        {(id) => (
          <Select id={id} value={filters.preset} onChange={(e) => onChange({ ...filters, preset: e.target.value as PeriodPreset })}>
            {(Object.keys(PRESET_LABEL) as PeriodPreset[]).map((p) => (
              <option key={p} value={p}>
                {PRESET_LABEL[p]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {filters.preset === 'custom' && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Field label="Du">
            {(id) => <TextInput id={id} type="date" value={filters.from} onChange={(e) => e.target.value && onChange({ ...filters, from: e.target.value })} />}
          </Field>
          <Field label="Au">
            {(id) => <TextInput id={id} type="date" value={filters.to} onChange={(e) => e.target.value && onChange({ ...filters, to: e.target.value })} />}
          </Field>
        </div>
      )}

      <p className="mb-1 px-1 text-[13px] font-medium text-label-2">Type</p>
      <Segmented
        label="Type d'opération"
        className="mb-4"
        value={(filters.types.length === 1 ? filters.types[0] : 'all') as TxType | 'all'}
        onChange={(v) => onChange({ ...filters, types: v === 'all' ? [] : [v] })}
        options={[
          { value: 'all', label: 'Tout' },
          { value: 'expense', label: 'Dépenses' },
          { value: 'income', label: 'Revenus' },
          { value: 'transfer', label: 'Virements' },
        ]}
      />

      <p className="mb-1.5 px-1 text-[13px] font-medium text-label-2">Catégories</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {categories.map((c) => {
          const on = filters.categoryIds.includes(c.id);
          return (
            <button
              key={c.id}
              aria-pressed={on}
              onClick={() => onChange({ ...filters, categoryIds: toggle(filters.categoryIds, c.id) })}
              className={`min-h-10 rounded-full px-3 text-[14px] font-medium ${on ? 'text-white' : 'bg-fill'}`}
              style={on ? { background: c.color } : undefined}
            >
              {c.emoji} {c.name}
            </button>
          );
        })}
      </div>

      <Field label="Compte">
        {(id) => (
          <Select id={id} value={filters.accountId} onChange={(e) => onChange({ ...filters, accountId: e.target.value })}>
            <option value="">Tous les comptes</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.emoji} {a.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Montant min (€)">
          {(id) => (
            <TextInput
              id={id}
              inputMode="decimal"
              value={minStr}
              placeholder="0"
              onChange={(e) => {
                setMinStr(e.target.value);
                onChange({ ...filters, min: e.target.value ? parseAmount(e.target.value) : null });
              }}
            />
          )}
        </Field>
        <Field label="Montant max (€)">
          {(id) => (
            <TextInput
              id={id}
              inputMode="decimal"
              value={maxStr}
              placeholder="∞"
              onChange={(e) => {
                setMaxStr(e.target.value);
                onChange({ ...filters, max: e.target.value ? parseAmount(e.target.value) : null });
              }}
            />
          )}
        </Field>
      </div>
    </Sheet>
  );
}

