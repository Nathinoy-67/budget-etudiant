import { useMemo, useState } from 'react';
import { Screen } from '../../components/Screen';
import { Button, EmptyState, Field, IconButton, Segmented, TextInput } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { useData } from '../../hooks/useData';
import { shiftPeriod, type Period } from '../../lib/dates';
import { formatMoney, parseAmount } from '../../lib/money';
import { TxDayList } from './TxDayList';
import type { ID } from '../../types';

type PeriodPreset = 'month' | '3m' | 'all';
type TypeFilter = 'all' | 'expense' | 'income';

const PRESET_LABEL: Record<PeriodPreset, string> = {
  month: 'Ce mois',
  '3m': '3 mois',
  all: 'Tout',
};

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const PAGE = 150;

/** Recherche et filtres sur toutes les opérations. */
export function SearchScreen({ params }: { params?: Record<string, string> }) {
  const { transactions, categories, period, today, settings, categoryById } = useData();
  const [query, setQuery] = useState('');
  const [preset, setPreset] = useState<PeriodPreset>((params?.preset as PeriodPreset) ?? 'all');
  const [type, setType] = useState<TypeFilter>('all');
  const [categoryIds, setCategoryIds] = useState<ID[]>([]);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const range: Period | null = useMemo(() => {
    const d = settings.monthStartDay;
    if (preset === 'month') return period;
    if (preset === '3m') return { start: shiftPeriod(period, -2, d).start, end: period.end };
    return null;
  }, [preset, period, settings.monthStartDay]);

  const minC = min ? parseAmount(min) : null;
  const maxC = max ? parseAmount(max) : null;
  const filterCount = (type !== 'all' ? 1 : 0) + (categoryIds.length ? 1 : 0) + (minC != null || maxC != null ? 1 : 0);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    const qAmount = parseAmount(query);
    return transactions.filter((t) => {
      if (t.type === 'transfer') return false;
      if (range && (t.date < range.start || t.date > range.end)) return false;
      if (type !== 'all' && t.type !== type) return false;
      if (categoryIds.length && (!t.categoryId || !categoryIds.includes(t.categoryId))) return false;
      if (minC != null && t.amount < minC) return false;
      if (maxC != null && t.amount > maxC) return false;
      if (q) {
        const hay = normalize(`${t.note} ${t.categoryId ? (categoryById.get(t.categoryId)?.name ?? '') : ''}`);
        if (!hay.includes(q) && !(qAmount != null && qAmount === t.amount)) return false;
      }
      return true;
    });
  }, [transactions, range, type, categoryIds, minC, maxC, query, categoryById]);

  const spent = filtered.reduce((s, t) => (t.type === 'expense' ? s + t.amount : s), 0);

  return (
    <Screen
      title="Rechercher"
      back
      actions={
        <span className="relative">
          <IconButton icon="filter" label="Filtres" onClick={() => setShowFilters(true)} />
          {filterCount > 0 && (
            <span className="pointer-events-none absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
              {filterCount}
            </span>
          )}
        </span>
      }
    >
      <div className="relative mb-3">
        <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-label-3" />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
          placeholder="Commerçant, catégorie, montant…"
          aria-label="Rechercher une opération"
          className="min-h-11 w-full rounded-xl bg-fill pr-3 pl-9 text-[16px] placeholder:text-label-3"
        />
      </div>

      <Segmented
        label="Période"
        className="mb-4"
        value={preset}
        onChange={(p) => {
          setPreset(p);
          setLimit(PAGE);
        }}
        options={(Object.keys(PRESET_LABEL) as PeriodPreset[]).map((p) => ({ value: p, label: PRESET_LABEL[p] }))}
      />

      <p className="mb-4 px-1 text-[13px] text-label-2">
        {filtered.length} opération{filtered.length > 1 ? 's' : ''} · {formatMoney(spent)} de dépenses
      </p>

      {filtered.length === 0 ? (
        <EmptyState icon="search" title="Aucun résultat" text="Essaie un autre mot ou une autre période." />
      ) : (
        <TxDayList transactions={filtered.slice(0, limit)} today={today} />
      )}
      {filtered.length > limit && (
        <Button variant="secondary" block onClick={() => setLimit(limit + PAGE)}>
          Afficher plus
        </Button>
      )}

      <Sheet
        open={showFilters}
        onClose={() => setShowFilters(false)}
        title="Filtres"
        left={
          <button
            className="min-h-11 px-2 text-[17px] text-accent"
            onClick={() => {
              setType('all');
              setCategoryIds([]);
              setMin('');
              setMax('');
            }}
          >
            Effacer
          </button>
        }
        right={
          <button className="min-h-11 px-2 text-[17px] font-semibold text-accent" onClick={() => setShowFilters(false)}>
            OK
          </button>
        }
      >
        <Segmented
          label="Type d'opération"
          className="mb-5"
          value={type}
          onChange={setType}
          options={[
            { value: 'all', label: 'Tout' },
            { value: 'expense', label: 'Dépenses' },
            { value: 'income', label: 'Revenus' },
          ]}
        />
        <p className="mb-2 px-1 text-[13px] font-medium text-label-2">Catégories</p>
        <div className="mb-5 flex flex-wrap gap-2">
          {categories
            .filter((c) => !c.archived && (type === 'all' || c.kind === type))
            .map((c) => {
              const on = categoryIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  aria-pressed={on}
                  onClick={() => setCategoryIds(on ? categoryIds.filter((x) => x !== c.id) : [...categoryIds, c.id])}
                  className={`min-h-10 rounded-full px-3.5 text-[14px] font-medium ${on ? 'bg-label text-bg' : 'bg-fill'}`}
                >
                  {c.emoji} {c.name}
                </button>
              );
            })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Montant min (€)">{(id) => <TextInput id={id} inputMode="decimal" value={min} placeholder="0" onChange={(e) => setMin(e.target.value)} />}</Field>
          <Field label="Montant max (€)">{(id) => <TextInput id={id} inputMode="decimal" value={max} placeholder="∞" onChange={(e) => setMax(e.target.value)} />}</Field>
        </div>
        {minC != null && maxC != null && minC > maxC && <p className="px-1 text-[13px] text-negative">Le minimum dépasse le maximum.</p>}
      </Sheet>
    </Screen>
  );
}

