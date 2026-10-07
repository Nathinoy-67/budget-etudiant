import { useMemo, useState } from 'react';
import { Screen } from '../../components/Screen';
import { Badge, Card, List, ProgressBar, Section, levelColor } from '../../components/ui';
import { AmountSheet } from '../../components/AmountSheet';
import { useData } from '../../hooks/useData';
import { budgetLevel, computeSummary, spentByCategory } from '../../lib/budget';
import { averageMonthlyByCategory } from '../../lib/simulator';
import { formatMoney } from '../../lib/money';
import { periodLabel } from '../../lib/dates';
import { setCategoryBudget } from '../../db/actions';
import { toast } from '../../stores/ui';
import type { Category } from '../../types';

export function BudgetsScreen() {
  const { categories, transactions, recurrings, period, today } = useData();
  const [editing, setEditing] = useState<Category | null>(null);

  const expenseCats = categories.filter((c) => c.kind === 'expense' && !c.archived);
  const spent = useMemo(() => spentByCategory(transactions, period), [transactions, period]);
  const averages = useMemo(() => averageMonthlyByCategory(transactions, today), [transactions, today]);
  const summary = useMemo(() => computeSummary(transactions, recurrings, period, today), [transactions, recurrings, period, today]);

  const withBudget = expenseCats.filter((c) => c.budget);
  const without = expenseCats.filter((c) => !c.budget);
  const totalBudget = withBudget.reduce((s, c) => s + (c.budget ?? 0), 0);
  const totalSpent = withBudget.reduce((s, c) => s + (spent.get(c.id) ?? 0), 0);
  const income = summary.income + summary.plannedIncome;
  const totalPct = totalBudget ? (totalSpent / totalBudget) * 100 : 0;

  // Proportion de la période écoulée : repère "où je devrais en être"
  const elapsedPct = (summary.daysElapsed / summary.daysTotal) * 100;

  return (
    <Screen title="Budgets" back subtitle={periodLabel(period)}>
      {totalBudget > 0 && (
      <Card className="mb-5 p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[13px] font-medium text-label-2">Total des budgets</p>
            <p className="text-[26px] font-bold tracking-tight tabular">
              {formatMoney(totalSpent, { compact: true })}
              <span className="text-[17px] font-medium text-label-2"> / {formatMoney(totalBudget, { compact: true })}</span>
            </p>
          </div>
          {totalBudget > 0 && <Badge tone={totalPct >= 100 ? 'negative' : totalPct >= 80 ? 'warning' : 'positive'}>{Math.round(totalPct)} %</Badge>}
        </div>
        <div className="relative mt-2">
          <ProgressBar pct={totalPct} height={10} label="Total des budgets" />
          <div className="absolute -top-1 h-[18px] w-0.5 rounded bg-label" style={{ left: `${Math.min(100, elapsedPct)}%` }} aria-hidden="true" />
        </div>
        <p className="mt-2 text-[13px] text-label-2">
          Repère : {Math.round(elapsedPct)} % du mois écoulé.
        </p>
        {income > 0 && totalBudget > income && (
          <p className="mt-2 text-[13px] font-medium text-warning">
            Tes budgets ({formatMoney(totalBudget, { compact: true })}) dépassent tes revenus du mois ({formatMoney(income, { compact: true })}).
          </p>
        )}
      </Card>
      )}

      {withBudget.length > 0 && (
        <Section title="Avec plafond" footer="Alerte à 80 % (orange) et à 100 % (rouge). Touche une catégorie pour modifier son plafond.">
          <List>
            {withBudget
              .map((c) => ({ c, s: spent.get(c.id) ?? 0 }))
              .sort((a, b) => b.s / (b.c.budget ?? 1) - a.s / (a.c.budget ?? 1))
              .map(({ c, s }) => {
                const pct = (s / (c.budget ?? 1)) * 100;
                const lvl = budgetLevel(pct);
                const remaining = (c.budget ?? 0) - s;
                return (
                  <button key={c.id} onClick={() => setEditing(c)} className="relative block w-full px-4 py-3 text-left active:bg-fill">
                    <div className="mb-1.5 flex items-center gap-3">
                      <span className="text-[22px]" aria-hidden="true">
                        {c.emoji}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[16px] font-medium">{c.name}</span>
                        <span className="block text-[13px]" style={{ color: lvl === 'ok' ? 'var(--label-2)' : levelColor(pct) }}>
                          {remaining >= 0 ? `Reste ${formatMoney(remaining)}` : `Dépassé de ${formatMoney(-remaining)}`}
                          {lvl === 'warn' && ' · 80 % atteint'}
                        </span>
                      </span>
                      <span className="text-right text-[14px] text-label-2 tabular">
                        <strong className="text-label">{formatMoney(s, { compact: true })}</strong>
                        <br />/ {formatMoney(c.budget ?? 0, { compact: true })}
                      </span>
                    </div>
                    <ProgressBar pct={pct} label={`Budget ${c.name}`} />
                  </button>
                );
              })}
          </List>
        </Section>
      )}

      <Section title={withBudget.length ? 'Sans plafond' : 'Définis tes plafonds'} footer="Astuce : commence par les catégories où tu dépenses sans t'en rendre compte (restos, loisirs).">
        <List>
          {without.map((c) => (
            <button key={c.id} onClick={() => setEditing(c)} className="relative flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left active:bg-fill">
              <span className="text-[22px]" aria-hidden="true">
                {c.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px]">{c.name}</span>
                <span className="block text-[13px] text-label-2">
                  Ce mois : {formatMoney(spent.get(c.id) ?? 0)}
                  {averages.get(c.id) ? ` · moy. ${formatMoney(averages.get(c.id)!, { compact: true })}/mois` : ''}
                </span>
              </span>
              <span className="text-[15px] font-medium text-accent">Définir</span>
            </button>
          ))}
        </List>
      </Section>

      <AmountSheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `${editing.emoji} ${editing.name}` : ''}
        initial={editing?.budget ?? null}
        onSave={async (cents) => {
          if (!editing) return;
          await setCategoryBudget(editing.id, cents);
          toast(`Budget ${editing.name} : ${formatMoney(cents)} / mois`, { tone: 'success' });
        }}
        onClear={editing?.budget ? async () => void (await setCategoryBudget(editing.id, null)) : undefined}
        clearLabel="Retirer"
        saveLabel="Définir le plafond"
      >
        {editing && (
          <div className="space-y-1 text-center text-[15px] text-label-2">
            <p>Plafond mensuel pour cette catégorie</p>
            <p>
              Dépensé ce mois : <strong className="text-label">{formatMoney(spent.get(editing.id) ?? 0)}</strong>
            </p>
            {averages.get(editing.id) ? (
              <p>
                Moyenne récente : <strong className="text-label">{formatMoney(averages.get(editing.id)!)}</strong> / mois
              </p>
            ) : null}
          </div>
        )}
      </AmountSheet>
    </Screen>
  );
}
