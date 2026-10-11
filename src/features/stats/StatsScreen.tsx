import { useMemo, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Screen } from '../../components/Screen';
import { Card, IconButton, List, Money, ProgressBar, Section, Tile, levelColor } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { AmountSheet } from '../../components/AmountSheet';
import { useData } from '../../hooks/useData';
import { useNav } from '../../stores/nav';
import { toast, useTxSheet } from '../../stores/ui';
import { addDays, diffDays, formatMonthShort, formatShortDate, inPeriod, periodLabel, shiftPeriod } from '../../lib/dates';
import { formatMoney } from '../../lib/money';
import { budgetLevel } from '../../lib/budget';
import { averageMonthlyByCategory } from '../../lib/simulator';
import { periodHistory, topExpenses, totalsByCategory, totalsForPeriod } from '../../lib/stats';
import { setCategoryBudget } from '../../db/actions';
import type { Category } from '../../types';

const AXIS = { fontSize: 11, fill: 'var(--label-2)' };
const euros = (c: number) => formatMoney(c, { compact: true }).replace(/[  ]/g, ' ');
const shortEuros = (c: number) => {
  const v = c / 100;
  return Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k€` : `${Math.round(v)} €`;
};

function ChartTooltip({
  active,
  payload,
  label,
  labelFormat,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string | number;
  labelFormat?: (l: string | number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-separator bg-elevated px-3.5 py-2.5 text-[13px] shadow-[0_12px_30px_-10px_rgba(0,0,0,0.3)]">
      {label != null && <p className="mb-1 font-semibold">{labelFormat ? labelFormat(label) : label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-label-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
          {p.name} : <span className="font-rounded font-semibold text-label tabular">{euros(Number(p.value ?? 0))}</span>
        </p>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-medium text-label-2">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ background: i.dashed ? `repeating-linear-gradient(90deg, ${i.color} 0 4px, transparent 4px 7px)` : i.color }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function ChartCard({ title, children, subtitle }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <Section title={title}>
      <Card className="p-4 pt-4.5">
        {subtitle && <div className="mb-3 text-[14px] text-label-2">{subtitle}</div>}
        {children}
      </Card>
    </Section>
  );
}

/** Analyse : le mois en chiffres, les catégories et leurs budgets, les tendances, le simulateur. */
export default function StatsScreen() {
  const { transactions, categories, categoryById, period: current, today, settings } = useData();
  const openEdit = useTxSheet((s) => s.openEdit);
  const push = useNav((s) => s.push);
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Category | null>(null);
  const startDay = settings.monthStartDay;

  const period = useMemo(() => shiftPeriod(current, offset, startDay), [current, offset, startDay]);
  const previous = useMemo(() => shiftPeriod(period, -1, startDay), [period, startDay]);
  const isCurrent = offset === 0;

  const totals = useMemo(() => totalsForPeriod(transactions, period), [transactions, period]);
  const byCat = useMemo(() => totalsByCategory(transactions, period), [transactions, period]);
  const incomeByCat = useMemo(() => totalsByCategory(transactions, period, 'income'), [transactions, period]);
  const history = useMemo(() => periodHistory(transactions, period, 6, startDay), [transactions, period, startDay]);
  const top = useMemo(() => topExpenses(transactions, period, 5), [transactions, period]);
  const averages = useMemo(() => averageMonthlyByCategory(transactions, today), [transactions, today]);

  const daysElapsed = isCurrent ? diffDays(period.start, today) + 1 : diffDays(period.start, period.end) + 1;
  // Abonnements et charges fixes réellement passés sur le mois affiché
  const fixedSpent = useMemo(
    () => transactions.reduce((sum, t) => (t.type === 'expense' && t.recurringId && inPeriod(t.date, period) ? sum + t.amount : sum), 0),
    [transactions, period],
  );
  // Mois en cours : comparaison à la même date du mois précédent (pas au mois complet)
  const prevTotals = useMemo(
    () => totalsForPeriod(transactions, isCurrent ? { start: previous.start, end: addDays(previous.start, daysElapsed - 1) } : previous),
    [transactions, previous, isCurrent, daysElapsed],
  );
  const vsLabel = isCurrent ? `vs ${formatMonthShort(previous.start)} à la même date` : 'vs mois précédent';

  // Catégories : dépensé + budget. L'anneau garde 5 parts + « Autres » pour rester lisible.
  const spentMap = useMemo(() => new Map(byCat.map((c) => [c.categoryId, c.total])), [byCat]);
  const expenseCats = useMemo(
    () =>
      categories
        .filter((c) => c.kind === 'expense' && !c.archived)
        .sort((a, b) => (spentMap.get(b.id) ?? 0) - (spentMap.get(a.id) ?? 0) || a.order - b.order),
    [categories, spentMap],
  );
  const pieData = useMemo(() => {
    const main = byCat.slice(0, 5).map((c) => ({ id: c.categoryId, color: categoryById.get(c.categoryId)?.color ?? '#8D8D8D', value: c.total }));
    const rest = byCat.slice(5).reduce((s, c) => s + c.total, 0);
    if (rest > 0) main.push({ id: '__other', color: '#8D8D8D', value: rest });
    return main;
  }, [byCat, categoryById]);

  const historyData = history.map((h) => ({ label: formatMonthShort(h.period.start), Revenus: h.income, Dépenses: h.expense }));

  return (
    <Screen title="Analyse">
      {/* Choix du mois */}
      <div className="mb-4 flex items-center justify-between rounded-full bg-card p-1 shadow-card">
        <IconButton icon="chevronLeft" label="Mois précédent" onClick={() => setOffset(offset - 1)} />
        <span className="text-[16px] font-semibold tracking-[-0.015em]">{periodLabel(period)}</span>
        <IconButton icon="chevronRight" label="Mois suivant" onClick={() => setOffset(offset + 1)} disabled={offset >= 0} className="disabled:opacity-30" />
      </div>

      {/* Le mois en chiffres */}
      <Card className="mb-8 p-5">
        <p className="text-[12px] font-semibold tracking-[0.09em] text-label-2 uppercase">Dépenses</p>
        <p className="font-rounded mt-2 text-[40px] leading-none font-semibold tracking-[-0.035em]">{formatMoney(totals.expense)}</p>
        <Delta current={totals.expense} previous={prevTotals.expense} label={vsLabel} />
        <div className="mt-5 grid grid-cols-3 divide-x divide-separator border-t border-separator pt-4 text-center">
          <SmallMetric label="Revenus" value={<Money cents={totals.income} compact className="text-positive" />} />
          <SmallMetric label="Abonnements" hint="et charges fixes" value={<Money cents={fixedSpent} compact className={fixedSpent ? 'text-negative' : ''} />} />
          <SmallMetric
            label="Solde"
            hint="revenus − dépenses"
            value={<Money cents={totals.net} compact colored />}
          />
        </div>
      </Card>

      {/* Catégories et budgets */}
      <Section title="Par catégorie" footer="Touche une catégorie pour fixer ou modifier son budget mensuel.">
        <Card className="overflow-hidden">
          {pieData.length > 0 && (
            <div className="relative mx-auto h-[220px] w-full max-w-[250px] pt-5">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    innerRadius="72%"
                    outerRadius="100%"
                    stroke="var(--card)"
                    strokeWidth={2}
                    cornerRadius={6}
                    paddingAngle={pieData.length > 1 ? 1.5 : 0}
                    startAngle={90}
                    endAngle={-270}
                    isAnimationActive={false}
                  >
                    {pieData.map((d) => (
                      <Cell key={d.id} fill={d.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-5 text-center">
                <span className="text-[12px] font-medium text-label-2">Total</span>
                <span className="font-rounded text-[22px] font-semibold tracking-[-0.02em]">{euros(totals.expense)}</span>
              </div>
            </div>
          )}
          <div className="mt-3">
            {expenseCats.map((c) => {
              const spent = spentMap.get(c.id) ?? 0;
              const budget = c.budget ?? 0;
              const pct = budget ? (spent / budget) * 100 : 0;
              const level = budget ? budgetLevel(pct) : 'ok';
              return (
                <button
                  key={c.id}
                  onClick={() => setEditing(c)}
                  className={`flex w-full items-center gap-3 border-t border-separator px-4 py-3 text-left transition-colors active:bg-fill ${spent || budget ? '' : 'opacity-50'}`}
                >
                  <Tile emoji={c.emoji} color={c.color} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">{c.name}</span>
                      <span className="font-rounded shrink-0 text-[15px] tabular">
                        <span className={`font-semibold ${budget && spent > budget ? 'text-negative' : ''}`}>{euros(spent)}</span>
                        {budget > 0 && <span className="text-label-2"> / {euros(budget)}</span>}
                      </span>
                    </span>
                    {budget > 0 && (
                      <>
                        <ProgressBar pct={pct} height={6} className="mt-2" color={level === 'ok' ? c.color : undefined} label={`Budget ${c.name}`} />
                        {level !== 'ok' && (
                          <span className="mt-1 block text-[12px] font-medium" style={{ color: levelColor(pct) }}>
                            {level === 'over' ? `Dépassé de ${euros(spent - budget)}` : `Reste ${euros(budget - spent)}`}
                          </span>
                        )}
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      </Section>

      {/* 6 derniers mois */}
      <ChartCard title="6 derniers mois">
        <Legend
          items={[
            { label: 'Revenus', color: 'var(--series-1)' },
            { label: 'Dépenses', color: 'var(--series-2)' },
          ]}
        />
        <div className="h-[190px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={historyData} margin={{ top: 6, right: 6, bottom: 0, left: -12 }} barGap={2} barCategoryGap="26%">
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={shortEuros} width={52} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--fill)' }} />
              <Bar dataKey="Revenus" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={14} />
              <Bar dataKey="Dépenses" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Revenus */}
      {incomeByCat.length > 0 && (
        <Section title="Revenus">
          <List inset={66}>
            {incomeByCat.map((c) => {
              const cat = categoryById.get(c.categoryId);
              return (
                <div key={c.categoryId} className="relative flex min-h-[60px] items-center gap-3 px-4">
                  <Tile emoji={cat?.emoji ?? '💶'} color={cat?.color} size={38} />
                  <span className="flex-1 truncate text-[15px] font-semibold tracking-[-0.01em]">{cat?.name ?? 'Revenu'}</span>
                  <Money cents={c.total} className="text-[15px] font-semibold text-positive" />
                </div>
              );
            })}
          </List>
        </Section>
      )}

      {/* Plus grosses dépenses */}
      {top.length > 0 && (
        <Section title="Plus grosses dépenses">
          <List inset={66}>
            {top.map((t) => {
              const cat = t.categoryId ? categoryById.get(t.categoryId) : undefined;
              return (
                <button key={t.id} onClick={() => openEdit(t)} className="relative flex min-h-[62px] w-full items-center gap-3 px-4 text-left transition-colors active:bg-fill">
                  <Tile emoji={cat?.emoji ?? '💸'} color={cat?.color} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold tracking-[-0.01em]">{t.note || cat?.name}</span>
                    <span className="block text-[13px] text-label-2">{formatShortDate(t.date, today)}</span>
                  </span>
                  <Money cents={-t.amount} className="text-[15px] font-semibold text-negative" />
                </button>
              );
            })}
          </List>
        </Section>
      )}

      {/* Simulateur */}
      <Section title="Et si… ?">
        <Card onClick={() => push('simulator')} className="flex items-center gap-4 p-4">
          <span className="bg-brand shadow-brand flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] text-white" aria-hidden="true">
            <Icon name="calculator" size={23} strokeWidth={2.1} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-semibold tracking-[-0.01em]">Simulateur d'économies</span>
            <span className="block text-[13px] text-label-2">Moins de restos, un abonnement en moins… combien sur un an ?</span>
          </span>
          <Icon name="chevronRight" size={18} className="text-label-3" />
        </Card>
      </Section>

      <AmountSheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Budget ${editing.name}` : ''}
        initial={editing?.budget ?? null}
        onSave={async (cents) => {
          if (!editing) return;
          await setCategoryBudget(editing.id, cents);
          toast(`Budget ${editing.name} : ${formatMoney(cents)} par mois`, { tone: 'success' });
        }}
        onClear={editing?.budget ? async () => void (await setCategoryBudget(editing.id, null)) : undefined}
        clearLabel="Retirer"
        saveLabel="Définir le budget"
      >
        {editing && (
          <div className="space-y-1 text-center text-[14px] text-label-2">
            <p>Plafond mensuel pour {editing.emoji} {editing.name}</p>
            <p>
              Ce mois-ci : <strong className="text-label">{formatMoney(spentMap.get(editing.id) ?? 0)}</strong>
              {averages.get(editing.id) ? (
                <>
                  {' '}
                  · moyenne : <strong className="text-label">{formatMoney(averages.get(editing.id)!)}</strong>/mois
                </>
              ) : null}
            </p>
          </div>
        )}
      </AmountSheet>
    </Screen>
  );
}

function SmallMetric({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 px-1.5">
      <p className="text-[12px] font-medium text-label-2">{label}</p>
      <p className="mt-0.5 truncate text-[17px] font-semibold tracking-[-0.02em]">{value}</p>
      {hint && <p className="truncate text-[10px] text-label-2">{hint}</p>}
    </div>
  );
}

function Delta({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (!previous) return <p className="mt-2.5 text-[13px] text-label-2">Pas de comparaison disponible</p>;
  const pct = ((current - previous) / previous) * 100;
  const less = pct <= 0;
  return (
    <p className="mt-3 flex items-center gap-2 text-[13px] text-label-2">
      <span
        className={`inline-flex items-center gap-0.5 rounded-full py-0.5 pr-2 pl-1.5 text-[12px] font-semibold ${less ? 'bg-positive-soft text-positive' : 'bg-negative-soft text-negative'}`}
      >
        <Icon name={pct >= 0 ? 'arrowUp' : 'arrowDown'} size={12} strokeWidth={2.8} />
        {Math.abs(Math.round(pct))} %
      </span>
      {label}
    </p>
  );
}
