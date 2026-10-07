import { useMemo, useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
} from 'recharts';
import { Screen } from '../../components/Screen';
import { Card, IconButton, List, Money, Section, Segmented } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useData } from '../../hooks/useData';
import { useTxSheet } from '../../stores/ui';
import { addDays, diffDays, formatMonthShort, formatShortDate, inPeriod, periodLabel, shiftPeriod } from '../../lib/dates';
import { formatMoney } from '../../lib/money';
import { incomeBySource } from '../../lib/budget';
import { INCOME_SOURCE_LABEL } from '../../db/defaults';
import {
  averagePerDay,
  balanceSeries,
  compareWithPrevious,
  cumulativeSpending,
  periodHistory,
  topExpenses,
  totalsByCategory,
  totalsForPeriod,
} from '../../lib/stats';

const AXIS = { fontSize: 11, fill: 'var(--label-2)' };
const euros = (c: number) => formatMoney(c, { compact: true }).replace(/[  ]/g, ' ');
const shortEuros = (c: number) => {
  const v = c / 100;
  return Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k€` : `${Math.round(v)} €`;
};

function ChartTooltip({ active, payload, label, labelFormat }: { active?: boolean; payload?: { name?: string; value?: number; color?: string; payload?: Record<string, unknown> }[]; label?: string | number; labelFormat?: (l: string | number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-separator bg-elevated px-3 py-2 text-[13px] shadow-lg">
      {label != null && <p className="mb-1 font-semibold">{labelFormat ? labelFormat(label) : label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-label-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
          {p.name} : <span className="font-semibold text-label tabular">{euros(Number(p.value ?? 0))}</span>
        </p>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-label-2">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="h-[3px] w-4 rounded-full" style={{ background: i.dashed ? `repeating-linear-gradient(90deg, ${i.color} 0 4px, transparent 4px 7px)` : i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function ChartCard({ title, children, subtitle }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <Section title={title}>
      <Card className="p-4">
        {subtitle && <div className="mb-2 text-[14px] text-label-2">{subtitle}</div>}
        {children}
      </Card>
    </Section>
  );
}

export default function StatsScreen() {
  const { transactions, accounts, categories, categoryById, period: current, today, settings } = useData();
  const openEdit = useTxSheet((s) => s.openEdit);
  const [offset, setOffset] = useState(0);
  const [selectedSlice, setSelectedSlice] = useState<string | null>(null);
  const [balanceRange, setBalanceRange] = useState<'30' | '90' | '365'>('90');
  const startDay = settings.monthStartDay;

  const period = useMemo(() => shiftPeriod(current, offset, startDay), [current, offset, startDay]);
  const previous = useMemo(() => shiftPeriod(period, -1, startDay), [period, startDay]);
  const isCurrent = offset === 0;

  const totals = useMemo(() => totalsForPeriod(transactions, period), [transactions, period]);
  const byCat = useMemo(() => totalsByCategory(transactions, period), [transactions, period]);
  const history = useMemo(() => periodHistory(transactions, period, 6, startDay), [transactions, period, startDay]);
  const top = useMemo(() => topExpenses(transactions, period, 5), [transactions, period]);
  const sources = useMemo(() => incomeBySource(transactions, categories, period), [transactions, categories, period]);

  const daysElapsed = isCurrent ? diffDays(period.start, today) + 1 : diffDays(period.start, period.end) + 1;
  const avgDay = averagePerDay(totals.expense, daysElapsed);
  // Mois en cours : on compare à la même date du mois précédent (pas au mois complet)
  const prevTotals = useMemo(
    () => totalsForPeriod(transactions, isCurrent ? { start: previous.start, end: addDays(previous.start, daysElapsed - 1) } : previous),
    [transactions, previous, isCurrent, daysElapsed],
  );
  const vsLabel = isCurrent ? `vs ${formatMonthShort(previous.start)} à date` : 'vs mois préc.';
  const comparison = useMemo(
    () =>
      isCurrent
        ? compareWithPrevious(transactions, { start: period.start, end: today }, { start: previous.start, end: addDays(previous.start, daysElapsed - 1) })
        : compareWithPrevious(transactions, period, previous),
    [transactions, period, previous, isCurrent, today, daysElapsed],
  );

  // Camembert : 6 premières catégories + "Autres" (au-delà, les couleurs ne se distinguent plus)
  const pieData = useMemo(() => {
    const main = byCat.slice(0, 6).map((c) => {
      const cat = categoryById.get(c.categoryId);
      return { id: c.categoryId, name: cat?.name ?? 'Sans catégorie', emoji: cat?.emoji ?? '❔', color: cat?.color ?? '#8D8D8D', value: c.total };
    });
    const rest = byCat.slice(6).reduce((s, c) => s + c.total, 0);
    if (rest > 0) main.push({ id: '__other', name: 'Autres', emoji: '➕', color: '#8D8D8D', value: rest });
    return main;
  }, [byCat, categoryById]);
  const selected = pieData.find((p) => p.id === selectedSlice);

  // Comparaison des dépenses cumulées avec le mois précédent
  const cumul = useMemo(() => {
    const cur = cumulativeSpending(transactions, period, isCurrent ? today : undefined);
    const prev = cumulativeSpending(transactions, previous);
    const len = Math.max(diffDays(period.start, period.end) + 1, prev.length);
    return Array.from({ length: len }, (_, i) => ({ day: i + 1, current: cur[i] ?? null, previous: prev[i] ?? null }));
  }, [transactions, period, previous, isCurrent, today]);
  const samePointPrev = cumul[Math.min(daysElapsed, cumul.length) - 1]?.previous ?? 0;
  const paceDelta = (cumul[daysElapsed - 1]?.current ?? totals.expense) - samePointPrev;

  const balance = useMemo(() => {
    const days = Number(balanceRange);
    const series = balanceSeries(accounts.filter((a) => !a.archived), transactions, addDays(today, -days + 1), today);
    const step = days > 120 ? 7 : 1;
    return series.filter((_, i) => i % step === 0 || i === series.length - 1);
  }, [accounts, transactions, today, balanceRange]);

  const historyData = history.map((h) => ({ label: formatMonthShort(h.period.start), Revenus: h.income, Dépenses: h.expense }));

  return (
    <Screen title="Statistiques">
      {/* Navigation de période */}
      <div className="mb-4 flex items-center justify-between rounded-2xl bg-card px-1">
        <IconButton icon="chevronLeft" label="Mois précédent" onClick={() => setOffset(offset - 1)} />
        <span className="text-[16px] font-semibold">{periodLabel(period)}</span>
        <IconButton icon="chevronRight" label="Mois suivant" onClick={() => setOffset(offset + 1)} disabled={offset >= 0} className="disabled:opacity-30" />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Card className="p-3.5">
          <p className="text-[13px] text-label-2">Dépenses</p>
          <Money cents={totals.expense} className="text-[20px] font-bold" />
          <Delta current={totals.expense} previous={prevTotals.expense} invert label={vsLabel} />
        </Card>
        <Card className="p-3.5">
          <p className="text-[13px] text-label-2">Revenus</p>
          <Money cents={totals.income} className="text-[20px] font-bold" />
          <Delta current={totals.income} previous={prevTotals.income} label={vsLabel} />
        </Card>
        <Card className="p-3.5">
          <p className="text-[13px] text-label-2">Moyenne / jour</p>
          <Money cents={avgDay} className="text-[20px] font-bold" />
          <p className="text-[12px] text-label-2">sur {daysElapsed} jour(s)</p>
        </Card>
        <Card className="p-3.5">
          <p className="text-[13px] text-label-2">Épargne du mois</p>
          <Money cents={totals.net} colored sign className="text-[20px] font-bold" />
          <p className="text-[12px] text-label-2">{totals.income > 0 ? `${Math.round((totals.net / totals.income) * 100)} % des revenus` : '—'}</p>
        </Card>
      </div>

      {/* Camembert par catégorie */}
      <ChartCard title="Dépenses par catégorie">
        {pieData.length === 0 ? (
          <p className="py-6 text-center text-[15px] text-label-2">Aucune dépense sur cette période.</p>
        ) : (
          <>
            <div className="relative mx-auto h-[220px] w-full max-w-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="62%"
                    outerRadius="96%"
                    paddingAngle={0}
                    stroke="var(--card)"
                    strokeWidth={2}
                    startAngle={90}
                    endAngle={-270}
                    isAnimationActive
                    onClick={(_, i) => setSelectedSlice(pieData[i]?.id === selectedSlice ? null : (pieData[i]?.id ?? null))}
                  >
                    {pieData.map((d) => (
                      <Cell key={d.id} fill={d.color} opacity={selectedSlice && selectedSlice !== d.id ? 0.35 : 1} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[13px] text-label-2">{selected ? `${selected.emoji} ${selected.name}` : 'Total'}</span>
                <span className="text-[20px] font-bold tabular">{euros(selected ? selected.value : totals.expense)}</span>
                {selected && <span className="text-[12px] text-label-2">{Math.round((selected.value / totals.expense) * 100)} %</span>}
              </div>
            </div>
            {/* Légende-tableau : l'identité ne repose jamais sur la seule couleur */}
            <div className="mt-3">
              {pieData.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelectedSlice(d.id === selectedSlice ? null : d.id)}
                  aria-pressed={selectedSlice === d.id}
                  className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-1 text-left ${selectedSlice === d.id ? 'bg-fill' : ''}`}
                >
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: d.color }} />
                  <span className="text-[17px]">{d.emoji}</span>
                  <span className="flex-1 truncate text-[15px]">{d.name}</span>
                  <span className="text-[13px] text-label-2 tabular">{Math.round((d.value / totals.expense) * 100)} %</span>
                  <span className="w-20 text-right text-[15px] font-semibold tabular">{euros(d.value)}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </ChartCard>

      {/* Rythme vs mois précédent */}
      <ChartCard
        title="Comparaison avec le mois précédent"
        subtitle={
          samePointPrev > 0 ? (
            <>
              À ce stade du mois, tu as dépensé{' '}
              <strong className={paceDelta > 0 ? 'text-negative' : 'text-positive'}>
                {euros(Math.abs(paceDelta))} {paceDelta > 0 ? 'de plus' : 'de moins'}
              </strong>{' '}
              que le mois dernier.
            </>
          ) : (
            'Pas encore de données le mois précédent.'
          )
        }
      >
        <Legend
          items={[
            { label: periodLabel(period), color: 'var(--series-1)' },
            { label: periodLabel(previous), color: 'var(--series-2)', dashed: true },
          ]}
        />
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={cumul} margin={{ top: 6, right: 6, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="day" tick={AXIS} tickLine={false} axisLine={false} interval={6} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={shortEuros} width={52} />
              <Tooltip content={<ChartTooltip labelFormat={(l) => `Jour ${l}`} />} cursor={{ stroke: 'var(--label-3)', strokeWidth: 1 }} />
              <Line type="monotone" dataKey="previous" name="Mois précédent" stroke="var(--series-2)" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
              <Line type="monotone" dataKey="current" name="Ce mois" stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--card)' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {comparison.length > 0 && (
          <div className="mt-3 border-t border-separator pt-2">
            {comparison.slice(0, 5).map((c) => {
              const cat = categoryById.get(c.categoryId);
              return (
                <div key={c.categoryId} className="flex min-h-10 items-center gap-2 text-[15px]">
                  <span>{cat?.emoji ?? '❔'}</span>
                  <span className="flex-1 truncate">{cat?.name ?? 'Sans catégorie'}</span>
                  <span className="text-[13px] text-label-2 tabular">
                    {euros(c.previous)} → {euros(c.current)}
                  </span>
                  <span className={`flex w-20 items-center justify-end gap-0.5 font-semibold tabular ${c.delta > 0 ? 'text-negative' : c.delta < 0 ? 'text-positive' : 'text-label-2'}`}>
                    <Icon name={c.delta > 0 ? 'arrowUp' : 'arrowDown'} size={13} strokeWidth={2.6} />
                    {c.deltaPct == null ? 'nouveau' : `${Math.abs(Math.round(c.deltaPct))} %`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </ChartCard>

      {/* Barres mois par mois */}
      <ChartCard title="6 derniers mois">
        <Legend
          items={[
            { label: 'Revenus', color: 'var(--series-1)' },
            { label: 'Dépenses', color: 'var(--series-2)' },
          ]}
        />
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={historyData} margin={{ top: 6, right: 6, bottom: 0, left: -12 }} barGap={2} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={shortEuros} width={52} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--fill)' }} />
              <Bar dataKey="Revenus" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={18} />
              <Bar dataKey="Dépenses" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Évolution du solde */}
      <ChartCard title="Évolution du solde (tous comptes)">
        <Segmented
          label="Période du graphique"
          className="mb-3"
          value={balanceRange}
          onChange={setBalanceRange}
          options={[
            { value: '30', label: '30 j' },
            { value: '90', label: '3 mois' },
            { value: '365', label: '1 an' },
          ]}
        />
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={balance} margin={{ top: 6, right: 6, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(d: string) => formatShortDate(d)} minTickGap={40} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={shortEuros} width={52} domain={['auto', 'auto']} />
              <Tooltip content={<ChartTooltip labelFormat={(l) => formatShortDate(String(l), today)} />} cursor={{ stroke: 'var(--label-3)', strokeWidth: 1 }} />
              <Area type="monotone" dataKey="balance" name="Solde" stroke="var(--series-1)" strokeWidth={2} fill="url(#balFill)" activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--card)' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Revenus par source */}
      {Object.keys(sources).length > 0 && (
        <Section title="Revenus par source">
          <List>
            {Object.entries(sources)
              .sort((a, b) => b[1] - a[1])
              .map(([src, v]) => (
                <div key={src} className="relative flex min-h-12 items-center justify-between px-4">
                  <span className="text-[16px]">{INCOME_SOURCE_LABEL[src] ?? src}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-[13px] text-label-2">{Math.round((v / totals.income) * 100)} %</span>
                    <Money cents={v} className="font-semibold" />
                  </span>
                </div>
              ))}
          </List>
        </Section>
      )}

      {/* Top dépenses */}
      {top.length > 0 && (
        <Section title="Top 5 des dépenses">
          <List>
            {top.map((t, i) => {
              const cat = t.categoryId ? categoryById.get(t.categoryId) : undefined;
              return (
                <button key={t.id} onClick={() => openEdit(t)} className="relative flex min-h-[52px] w-full items-center gap-3 px-4 text-left active:bg-fill">
                  <span className="w-5 text-[15px] font-bold text-label-3">{i + 1}</span>
                  <span className="text-[19px]">{cat?.emoji ?? '💸'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px]">{t.note || cat?.name}</span>
                    <span className="block text-[13px] text-label-2">{formatShortDate(t.date, today)}</span>
                  </span>
                  <Money cents={-t.amount} className="font-semibold" />
                </button>
              );
            })}
          </List>
        </Section>
      )}
      {!inPeriod(today, period) && totals.expense === 0 && totals.income === 0 && (
        <p className="text-center text-[15px] text-label-2">Aucune donnée pour cette période.</p>
      )}
    </Screen>
  );
}

function Delta({ current, previous, invert, label }: { current: number; previous: number; invert?: boolean; label: string }) {
  if (!previous) return <p className="text-[12px] text-label-2">{label} : —</p>;
  const pct = ((current - previous) / previous) * 100;
  const good = invert ? pct <= 0 : pct >= 0;
  return (
    <p className={`flex items-center gap-0.5 text-[12px] font-medium ${good ? 'text-positive' : 'text-negative'}`}>
      <Icon name={pct >= 0 ? 'arrowUp' : 'arrowDown'} size={12} strokeWidth={2.6} />
      {Math.abs(Math.round(pct))} % {label}
    </p>
  );
}
