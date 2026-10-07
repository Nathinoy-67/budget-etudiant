import { useMemo, useState } from 'react';
import { Screen } from '../../components/Screen';
import { Card, IconButton, List, Money, ProgressBar, Ring, Section, levelColor } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { useData } from '../../hooks/useData';
import { useNav } from '../../stores/nav';
import { toast, useTxSheet } from '../../stores/ui';
import { categoryBudgets, computeSummary } from '../../lib/budget';
import { formatMoney } from '../../lib/money';
import { formatShortDate, inDaysLabel, periodLabel } from '../../lib/dates';
import { goalProgress } from '../../lib/goals';
import { haptic } from '../../lib/haptics';
import { addTransaction, deleteTransaction } from '../../db/actions';
import { checkBudgetAfterChange } from '../alerts';
import { TxRow } from '../transactions/TxRow';
import { BackupBanner } from '../settings/BackupBanner';
import type { QuickAdd } from '../../types';

export function Dashboard() {
  const data = useData();
  const { transactions, recurrings, period, today, categories, quickAdds, goals, contributions, settings, categoryById } = data;
  const open = useNav((s) => s.open);
  const setTab = useNav((s) => s.setTab);
  const openNew = useTxSheet((s) => s.openNew);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const s = useMemo(() => computeSummary(transactions, recurrings, period, today), [transactions, recurrings, period, today]);
  const budgets = useMemo(() => categoryBudgets(categories, transactions, period), [categories, transactions, period]);
  const recent = transactions.filter((t) => t.date <= today).slice(0, 5);
  const activeGoals = goals.filter((g) => !g.archived).slice(0, 4);
  const hasData = transactions.length > 0 || recurrings.length > 0;

  const quickAdd = async (q: QuickAdd) => {
    haptic('success');
    const tx = await addTransaction({
      type: 'expense',
      amount: q.amount,
      date: today,
      categoryId: q.categoryId,
      accountId: q.accountId ?? settings.defaultAccountId ?? data.accounts[0]?.id,
      toAccountId: null,
      note: q.label,
      recurringId: null,
      occurrence: null,
    });
    toast(`${q.emoji} ${q.label} · ${formatMoney(q.amount)} ajouté`, {
      action: { label: 'Annuler', onClick: () => void deleteTransaction(tx.id) },
    });
    void checkBudgetAfterChange(data, tx);
  };

  const rav = s.resteAVivre;
  const ravTone = rav < 0 ? 'from-[#d1242f] to-[#a3121c]' : 'from-[#6d5cf0] to-[#4338ca]';

  return (
    <Screen
      title={periodLabel(period)}
      subtitle={`${s.daysLeft > 0 ? `Encore ${s.daysLeft} jour${s.daysLeft > 1 ? 's' : ''} avant la fin du mois` : 'Période terminée'}`}
      actions={<IconButton icon="sliders" label="Réglages" onClick={() => open('settings')} />}
    >
      <BackupBanner />

      {/* Carte principale : reste à vivre */}
      <button
        onClick={() => setShowBreakdown(true)}
        className={`pressable mb-4 block w-full overflow-hidden rounded-3xl bg-gradient-to-br ${ravTone} p-5 text-left text-white shadow-lg`}
        aria-label={`Reste à vivre ${formatMoney(rav)}. Toucher pour le détail.`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-[15px] font-medium text-white/80">
              Reste à vivre <Icon name="info" size={15} />
            </p>
            <p className="mt-1 text-[40px] leading-none font-bold tracking-tight tabular">{formatMoney(rav)}</p>
            <p className="mt-3 text-[15px] text-white/90">
              {s.daysLeft > 0 ? (
                <>
                  soit <strong className="tabular">{formatMoney(s.dailyAllowance)}</strong> / jour jusqu'au {formatShortDate(period.end)}
                </>
              ) : (
                'Période terminée'
              )}
            </p>
          </div>
          <Ring pct={s.engagedPct} size={84} stroke={9} color="#ffffff" label={`${Math.round(s.engagedPct)} % des revenus engagés`}>
            <span className="text-[18px] font-bold tabular">{Math.round(Math.min(s.engagedPct, 999))}%</span>
            <span className="text-[10px] text-white/80">engagé</span>
          </Ring>
        </div>
        {!hasData && (
          <p className="mt-3 rounded-xl bg-white/15 px-3 py-2 text-[14px]">
            Ajoute tes revenus et ton loyer (onglet Plus → Récurrentes) pour un calcul précis.
          </p>
        )}
      </button>

      {/* Indicateurs */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <Stat label="Solde du mois" value={<Money cents={s.balance} colored sign />} hint="reçu − dépensé" />
        <Stat label="Aujourd'hui" value={<Money cents={-s.todaySpent} />} hint={s.todaySpent ? 'dépensé' : 'rien pour l’instant'} />
        <Stat
          label="Prévision fin de mois"
          value={<Money cents={s.projectedEnd} colored sign />}
          hint={`au rythme de ${formatMoney(s.daysElapsed ? Math.round(s.variableSpent / s.daysElapsed) : 0)}/j`}
        />
        <Stat label="Charges à venir" value={<Money cents={-s.fixedUpcoming} />} hint={`${s.upcoming.filter((u) => u.type === 'expense').length} échéance(s)`} />
      </div>

      {/* Raccourcis */}
      <Section
        title="Ajout express"
        action={
          <button className="min-h-8 text-[15px] text-accent" onClick={() => open('quickadds')}>
            Modifier
          </button>
        }
      >
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {quickAdds.map((q) => (
            <button
              key={q.id}
              onClick={() => void quickAdd(q)}
              onContextMenu={(e) => {
                e.preventDefault();
                openNew({ type: 'expense', amount: q.amount, categoryId: q.categoryId, accountId: q.accountId, note: q.label });
              }}
              className="pressable flex min-h-[64px] shrink-0 flex-col items-start justify-center rounded-2xl bg-card px-3.5 py-2"
              aria-label={`Ajouter ${q.label} ${formatMoney(q.amount)}`}
            >
              <span className="text-[15px] font-semibold">
                {q.emoji} {q.label}
              </span>
              <span className="text-[13px] text-label-2 tabular">{formatMoney(q.amount)}</span>
            </button>
          ))}
          <button
            onClick={() => open('quickadds')}
            className="pressable flex min-h-[64px] w-16 shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-separator text-label-2"
            aria-label="Ajouter un raccourci"
          >
            <Icon name="plus" />
          </button>
        </div>
      </Section>

      {/* Budgets */}
      {budgets.length > 0 && (
        <Section
          title="Budgets"
          action={
            <button className="min-h-8 text-[15px] text-accent" onClick={() => open('budgets')}>
              Tout voir
            </button>
          }
        >
          <Card className="space-y-3.5 p-4">
            {budgets.slice(0, 4).map((b) => (
              <div key={b.category.id}>
                <div className="mb-1 flex items-center justify-between gap-2 text-[15px]">
                  <span className="truncate">
                    {b.category.emoji} {b.category.name}
                    {b.level !== 'ok' && <span className="ml-1">{b.level === 'over' ? '⛔' : '⚠️'}</span>}
                  </span>
                  <span className="shrink-0 text-label-2 tabular">
                    <span style={{ color: b.level === 'ok' ? undefined : levelColor(b.pct) }} className="font-semibold">
                      {formatMoney(b.spent, { compact: true })}
                    </span>{' '}
                    / {formatMoney(b.budget, { compact: true })}
                  </span>
                </div>
                <ProgressBar pct={b.pct} label={`Budget ${b.category.name}`} />
              </div>
            ))}
          </Card>
        </Section>
      )}

      {/* À venir */}
      {s.upcoming.length > 0 && (
        <Section
          title="À venir ce mois-ci"
          action={
            <button className="min-h-8 text-[15px] text-accent" onClick={() => open('recurrings')}>
              Gérer
            </button>
          }
        >
          <List>
            {s.upcoming.slice(0, 4).map((u) => {
              const cat = u.categoryId ? categoryById.get(u.categoryId) : undefined;
              return (
                <div key={`${u.recurringId}-${u.date}`} className="relative flex min-h-[52px] items-center gap-3 px-4 py-2">
                  <span className="text-[20px]" aria-hidden="true">
                    {recurrings.find((r) => r.id === u.recurringId)?.emoji ?? cat?.emoji ?? '🔁'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px]">{u.name}</span>
                    <span className="block text-[13px] text-label-2">
                      {formatShortDate(u.date)} · {inDaysLabel(u.date, today)}
                    </span>
                  </span>
                  <Money
                    cents={u.type === 'income' ? u.amount : -u.amount}
                    sign={u.type === 'income'}
                    className={`text-[16px] font-semibold ${u.type === 'income' ? 'text-positive' : ''}`}
                  />
                </div>
              );
            })}
          </List>
        </Section>
      )}

      {/* Objectifs */}
      {activeGoals.length > 0 && (
        <Section
          title="Objectifs"
          action={
            <button className="min-h-8 text-[15px] text-accent" onClick={() => open('goals')}>
              Tout voir
            </button>
          }
        >
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {activeGoals.map((g) => {
              const p = goalProgress(g, contributions, today);
              return (
                <button
                  key={g.id}
                  onClick={() => open('goal', { id: g.id })}
                  className="pressable flex w-[150px] shrink-0 flex-col rounded-2xl bg-card p-3.5 text-left"
                >
                  <span className="text-[24px]">{g.emoji}</span>
                  <span className="mt-1 truncate text-[15px] font-semibold">{g.name}</span>
                  <span className="text-[13px] text-label-2 tabular">
                    {formatMoney(p.saved, { compact: true })} / {formatMoney(g.target, { compact: true })}
                  </span>
                  <ProgressBar pct={p.pct} color={g.color} className="mt-2" label={`Progression ${g.name}`} />
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {/* Dernières opérations */}
      <Section
        title="Dernières opérations"
        action={
          recent.length > 0 && (
            <button className="min-h-8 text-[15px] text-accent" onClick={() => setTab('transactions')}>
              Tout voir
            </button>
          )
        }
      >
        {recent.length ? (
          <List>
            {recent.map((t) => (
              <TxRow key={t.id} tx={t} showDate={formatShortDate(t.date, today)} />
            ))}
          </List>
        ) : (
          <Card className="p-5 text-center">
            <p className="text-[17px] font-semibold">Aucune opération pour l'instant</p>
            <p className="mt-1 text-[15px] text-label-2">Touche le bouton + en bas pour ajouter ta première dépense.</p>
          </Card>
        )}
      </Section>

      <Sheet open={showBreakdown} onClose={() => setShowBreakdown(false)} title="Comment c'est calculé ?" left={<span />} right={
        <button className="min-h-11 px-2 text-[17px] font-semibold text-accent" onClick={() => setShowBreakdown(false)}>OK</button>
      }>
        <List className="mb-4">
          <BreakRow label="Revenus déjà reçus" cents={s.income} />
          <BreakRow label="Revenus attendus (récurrents)" cents={s.plannedIncome} />
          <BreakRow label="Charges fixes déjà payées" cents={-s.fixedPaid} />
          <BreakRow label="Charges fixes à venir" cents={-s.fixedUpcoming} />
          <BreakRow label="Dépenses variables" cents={-s.variableSpent} />
          <BreakRow label="Reste à vivre" cents={s.resteAVivre} bold />
        </List>
        <p className="mb-2 text-[15px] text-label-2">
          Le <strong>reste à vivre</strong>, c'est ce qu'il te reste pour finir le mois une fois toutes tes charges fixes payées
          (loyer, abonnements…), y compris celles qui ne sont pas encore prélevées.
        </p>
        <p className="mb-2 text-[15px] text-label-2">
          Divisé par les <strong>{s.daysLeft} jour(s)</strong> restants (aujourd'hui compris), ça te donne{' '}
          <strong>{formatMoney(s.dailyAllowance)} par jour</strong>.
        </p>
        <p className="text-[15px] text-label-2">
          La <strong>prévision</strong> extrapole tes dépenses variables ({formatMoney(s.variableSpent)} en {s.daysElapsed} j) sur
          les {s.daysTotal} jours de la période. Les virements entre tes comptes ne comptent ni comme revenu ni comme dépense.
        </p>
      </Sheet>
    </Screen>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl bg-card p-3.5">
      <p className="text-[13px] font-medium text-label-2">{label}</p>
      <p className="mt-1 text-[20px] font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 truncate text-[12px] text-label-2">{hint}</p>}
    </div>
  );
}

function BreakRow({ label, cents, bold }: { label: string; cents: number; bold?: boolean }) {
  return (
    <div className={`relative flex min-h-12 items-center justify-between gap-3 px-4 ${bold ? 'font-bold' : ''}`}>
      <span className="text-[16px]">{label}</span>
      <Money cents={cents} sign colored={bold} className="text-[16px]" />
    </div>
  );
}
