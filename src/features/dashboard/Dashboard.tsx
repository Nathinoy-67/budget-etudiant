import { useMemo, useState, type ReactNode } from 'react';
import { Screen } from '../../components/Screen';
import { Button, Card, List, Money, Section } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { useData } from '../../hooks/useData';
import { useNav } from '../../stores/nav';
import { computeSummary } from '../../lib/budget';
import { formatMoney } from '../../lib/money';
import { formatShortDate, inDaysLabel, periodLabel } from '../../lib/dates';
import { TxRow } from '../transactions/TxRow';
import { BackupBanner } from '../settings/BackupBanner';
import { KeepAtEndSheet } from '../settings/KeepAtEndSheet';
import { backToRealData } from '../settings/demoActions';

/**
 * Accueil : combien je peux encore dépenser ce mois-ci, ce qui arrive, mes dernières opérations.
 * Pas de prévision ni de moyenne par jour : un gros achat compte une fois, pour son montant réel.
 */
export function Dashboard() {
  const { transactions, recurrings, period, today, categoryById, settings } = useData();
  const push = useNav((s) => s.push);
  const setTab = useNav((s) => s.setTab);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [editKeep, setEditKeep] = useState(false);

  const keepAtEnd = settings.keepAtEnd ?? 0;
  const s = useMemo(() => computeSummary(transactions, recurrings, period, today, keepAtEnd), [transactions, recurrings, period, today, keepAtEnd]);
  const recent = useMemo(() => transactions.filter((t) => t.type !== 'transfer' && t.date <= today).slice(0, 6), [transactions, today]);
  const upcoming = s.upcoming.filter((u) => u.type !== 'transfer').slice(0, 3);
  const totalIncome = s.income + s.plannedIncome;
  const fixedTotal = s.fixedPaid + s.fixedUpcoming;
  const engaged = fixedTotal + s.variableSpent;
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
      {settings.demoMode && (
        <Card className="mb-3 flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-accent-soft text-accent" aria-hidden="true">
            <Icon name="sparkles" size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Données exemple</span>
            <span className="block text-[13px] text-label-2">Tes vraies données sont mises de côté.</span>
          </span>
          <Button variant="tinted" className="min-h-10 px-3 text-[15px]" onClick={() => void backToRealData()}>
            Revenir
          </Button>
        </Card>
      )}
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
          {rav < 0 ? (
            keepAtEnd > 0 ? (
              <>
                Tu entames les <span className="font-medium text-on-ink tabular">{formatMoney(keepAtEnd)}</span> à garder
              </>
            ) : (
              'Tu as dépensé plus que tes revenus du mois'
            )
          ) : keepAtEnd > 0 ? (
            <>
              en gardant <span className="font-medium text-on-ink tabular">{formatMoney(keepAtEnd)}</span> pour la fin du mois
            </>
          ) : (
            `à dépenser jusqu'au ${formatShortDate(period.end)}`
          )}
        </p>
        <div className="mt-5">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-white/15"
            role="progressbar"
            aria-valuenow={Math.round(s.engagedPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Part du budget du mois déjà utilisée"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-700 ${s.engagedPct >= 100 ? 'bg-[#ff8a80]' : 'bg-white'}`}
              style={{ width: `${Math.min(100, s.engagedPct)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[12px] text-on-ink-2 tabular">
            <span>{formatMoney(engaged, { compact: true })} dépensés ou prévus</span>
            <span>sur {formatMoney(totalIncome - keepAtEnd, { compact: true })}</span>
          </div>
        </div>
      </button>

      {/* D'où vient le reste à vivre : revenus − abonnements et charges − dépenses */}
      <Card className="mt-3 grid grid-cols-3 divide-x divide-separator py-3.5">
        <Metric label="Revenus" value={<Money cents={totalIncome} compact />} />
        <Metric label="Abonnements" hint="et charges fixes" value={<Money cents={-fixedTotal} compact />} />
        <Metric label="Dépenses" value={<Money cents={-s.variableSpent} compact />} />
      </Card>

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
          <BreakRow label="Abonnements et charges payés" cents={-s.fixedPaid} />
          <BreakRow label="Abonnements et charges à venir" cents={-s.fixedUpcoming} />
          <BreakRow label="Dépenses courantes" cents={-s.variableSpent} />
          <button onClick={() => setEditKeep(true)} className="relative flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left active:bg-fill">
            <span className="text-[15px]">
              À garder en fin de mois <span className="text-accent">· {keepAtEnd ? 'Modifier' : 'Définir'}</span>
            </span>
            <Money cents={-keepAtEnd} sign className="text-[15px]" />
          </button>
          <BreakRow label="Reste à vivre" cents={s.resteAVivre} bold />
        </List>
        <div className="space-y-2 px-1 text-[14px] leading-relaxed text-label-2">
          <p>
            Le <strong className="text-label">reste à vivre</strong> est ce que tu peux encore dépenser ce mois-ci : tes revenus, moins tes abonnements et
            charges fixes (même ceux pas encore prélevés), moins ce que tu as déjà dépensé
            {keepAtEnd ? (
              <>
                , moins les <strong className="text-label">{formatMoney(keepAtEnd)}</strong> que tu veux garder
              </>
            ) : null}
            .
          </p>
          <p>Aucune prévision : un gros achat compte une seule fois, pour son montant réel.</p>
          <p>
            Pour qu'un abonnement soit déduit dès le début du mois, ouvre l'opération et active <strong className="text-label">« C'est un abonnement »</strong>.
          </p>
        </div>
      </Sheet>
      <KeepAtEndSheet open={editKeep} onClose={() => setEditKeep(false)} current={keepAtEnd} />
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
