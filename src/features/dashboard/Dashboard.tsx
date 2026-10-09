import { useMemo, useState, type ReactNode } from 'react';
import { Screen } from '../../components/Screen';
import { Card, List, Money, Section } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { useData } from '../../hooks/useData';
import { useNav } from '../../stores/nav';
import { categoryBudgets, computeSummary } from '../../lib/budget';
import { formatMoney } from '../../lib/money';
import { formatShortDate, inDaysLabel, periodLabel } from '../../lib/dates';
import { TxRow } from '../transactions/TxRow';
import { BackupBanner } from '../settings/BackupBanner';

/** Accueil : où j'en suis ce mois-ci, ce qui arrive, et toutes mes opérations du mois. */
export function Dashboard() {
  const { transactions, recurrings, period, today, categories, categoryById } = useData();
  const push = useNav((s) => s.push);
  const setTab = useNav((s) => s.setTab);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const s = useMemo(() => computeSummary(transactions, recurrings, period, today), [transactions, recurrings, period, today]);
  const alerts = useMemo(() => categoryBudgets(categories, transactions, period).filter((b) => b.level !== 'ok'), [categories, transactions, period]);
  const recent = useMemo(() => transactions.filter((t) => t.type !== 'transfer' && t.date <= today).slice(0, 6), [transactions, today]);
  const upcoming = s.upcoming.filter((u) => u.type !== 'transfer').slice(0, 3);
  const totalIncome = s.income + s.plannedIncome;
  const engaged = s.fixedPaid + s.fixedUpcoming + s.variableSpent;
  const rav = s.resteAVivre;

  const link = (label: string, onClick: () => void) => (
    <button className="min-h-8 text-[15px] font-medium text-accent" onClick={onClick}>
      {label}
    </button>
  );

  return (
    <Screen
      title={periodLabel(period)}
      subtitle={s.daysLeft > 0 ? `${s.daysLeft} jour${s.daysLeft > 1 ? 's' : ''} restant${s.daysLeft > 1 ? 's' : ''}` : 'Période terminée'}
    >
      <BackupBanner />

      {/* Reste à vivre */}
      <button
        onClick={() => setShowBreakdown(true)}
        className="pressable block w-full rounded-[22px] bg-ink p-5 text-left text-on-ink"
        aria-label={`Reste à vivre ${formatMoney(rav)}. Toucher pour le détail du calcul.`}
      >
        <div className="flex items-center justify-between text-[14px] text-on-ink-2">
          <span>Reste à vivre</span>
          <Icon name="info" size={16} />
        </div>
        <p className={`mt-1 text-[40px] leading-tight font-semibold tracking-[-0.03em] tabular ${rav < 0 ? 'text-[#ff8a80]' : ''}`}>
          {formatMoney(rav)}
        </p>
        <p className="mt-0.5 text-[15px] text-on-ink-2">
          {s.daysLeft > 0 ? (
            <>
              <span className="font-medium text-on-ink tabular">{formatMoney(s.dailyAllowance)}</span> par jour jusqu'au {formatShortDate(period.end)}
            </>
          ) : (
            'Période terminée'
          )}
        </p>
        <div className="mt-5">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-white/15"
            role="progressbar"
            aria-valuenow={Math.round(s.engagedPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Part des revenus déjà engagée"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-700 ${s.engagedPct >= 100 ? 'bg-[#ff8a80]' : 'bg-white'}`}
              style={{ width: `${Math.min(100, s.engagedPct)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[12px] text-on-ink-2 tabular">
            <span>{formatMoney(engaged, { compact: true })} engagés</span>
            <span>sur {formatMoney(totalIncome, { compact: true })} de revenus</span>
          </div>
        </div>
      </button>

      {/* Trois chiffres clés */}
      <Card className="mt-3 grid grid-cols-3 divide-x divide-separator py-3.5">
        <Metric label="Dépensé" value={<Money cents={s.totalSpent} compact />} />
        <Metric label="Aujourd'hui" value={<Money cents={s.todaySpent} compact />} />
        <Metric label="Fin du mois" value={<Money cents={s.projectedEnd} compact className={s.projectedEnd < 0 ? 'text-negative' : ''} />} hint="prévision" />
      </Card>

      {/* Alerte budget, seulement si nécessaire */}
      {alerts.length > 0 && (
        <button onClick={() => setTab('stats')} className="pressable mt-3 flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left shadow-card">
          <span className={`h-2 w-2 shrink-0 rounded-full ${alerts.some((a) => a.level === 'over') ? 'bg-negative' : 'bg-warning'}`} aria-hidden="true" />
          <span className="min-w-0 flex-1 text-[15px]">
            {alerts.length === 1
              ? `${alerts[0].category.name} : ${alerts[0].level === 'over' ? 'budget dépassé' : `${Math.round(alerts[0].pct)} % du budget`}`
              : `${alerts.length} budgets à surveiller`}
          </span>
          <Icon name="chevronRight" size={18} className="text-label-3" />
        </button>
      )}

      <div className="h-7" />

      {/* À venir */}
      {upcoming.length > 0 && (
        <Section title="À venir" action={link('Gérer', () => push('recurrings'))}>
          <List>
            {upcoming.map((u) => {
              const cat = u.categoryId ? categoryById.get(u.categoryId) : undefined;
              return (
                <div key={`${u.recurringId}-${u.date}`} className="relative flex min-h-[60px] items-center gap-3 px-4 py-2">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-fill text-[19px]" aria-hidden="true">
                    {recurrings.find((r) => r.id === u.recurringId)?.emoji ?? cat?.emoji ?? '🔁'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{u.name}</span>
                    <span className="block text-[13px] text-label-2">
                      {formatShortDate(u.date)} · {inDaysLabel(u.date, today)}
                    </span>
                  </span>
                  <Money
                    cents={u.type === 'income' ? u.amount : -u.amount}
                    sign={u.type === 'income'}
                    className={`text-[15px] font-semibold ${u.type === 'income' ? 'text-positive' : ''}`}
                  />
                </div>
              );
            })}
          </List>
        </Section>
      )}

      {/* Dernières opérations (la liste complète est dans l'onglet Opérations) */}
      <Section title="Récent" action={recent.length > 0 && link('Tout voir', () => setTab('operations'))}>
        {recent.length ? (
          <List>
            {recent.map((t) => (
              <TxRow key={t.id} tx={t} showDate={formatShortDate(t.date, today)} />
            ))}
          </List>
        ) : (
          <Card className="px-5 py-6 text-center">
            <p className="text-[16px] font-semibold">Aucune opération</p>
            <p className="mt-1 text-[14px] text-label-2">Touche + pour ajouter une dépense, ou importe ton relevé depuis l'onglet Opérations.</p>
          </Card>
        )}
      </Section>

      <Sheet
        open={showBreakdown}
        onClose={() => setShowBreakdown(false)}
        title="Détail du calcul"
        left={<span />}
        right={
          <button className="min-h-11 px-2 text-[17px] font-semibold text-accent" onClick={() => setShowBreakdown(false)}>
            OK
          </button>
        }
      >
        <List className="mb-4">
          <BreakRow label="Revenus reçus" cents={s.income} />
          <BreakRow label="Revenus attendus" cents={s.plannedIncome} />
          <BreakRow label="Charges fixes payées" cents={-s.fixedPaid} />
          <BreakRow label="Charges fixes à venir" cents={-s.fixedUpcoming} />
          <BreakRow label="Dépenses courantes" cents={-s.variableSpent} />
          <BreakRow label="Reste à vivre" cents={s.resteAVivre} bold />
        </List>
        <div className="space-y-2 px-1 text-[14px] leading-relaxed text-label-2">
          <p>
            Le <strong className="text-label">reste à vivre</strong> est ce qu'il te reste une fois toutes les charges fixes du mois déduites (loyer,
            abonnements…), y compris celles qui ne sont pas encore prélevées.
          </p>
          <p>
            Réparti sur les <strong className="text-label">{s.daysLeft} jour(s)</strong> restants, cela fait{' '}
            <strong className="text-label">{formatMoney(s.dailyAllowance)} par jour</strong>.
          </p>
          <p>
            La <strong className="text-label">prévision de fin de mois</strong> prolonge ton rythme actuel de dépenses courantes (
            {formatMoney(s.variableSpent)} en {s.daysElapsed} j).
          </p>
        </div>
      </Sheet>
    </Screen>
  );
}

function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 px-3 text-center">
      <p className="text-[12px] text-label-2">{label}</p>
      <p className="mt-0.5 truncate text-[17px] font-semibold tracking-[-0.01em]">{value}</p>
      {hint && <p className="text-[11px] text-label-3">{hint}</p>}
    </div>
  );
}

function BreakRow({ label, cents, bold }: { label: string; cents: number; bold?: boolean }) {
  return (
    <div className={`relative flex min-h-12 items-center justify-between gap-3 px-4 ${bold ? 'font-semibold' : ''}`}>
      <span className="text-[15px]">{label}</span>
      <Money cents={cents} sign className={`text-[15px] ${bold && cents < 0 ? 'text-negative' : ''}`} />
    </div>
  );
}
