import { useMemo, useState, type ReactNode } from 'react';
import { Screen } from '../../components/Screen';
import { Button, Card, List, Money, Section, Tile } from '../../components/ui';
import { Icon, type IconName } from '../../components/Icon';
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
import type { Cents } from '../../types';

/**
 * Accueil : combien je peux encore dépenser ce mois-ci (et en moyenne par jour), où j'en suis aujourd'hui,
 * ce qui arrive, mes dernières opérations. Pas de prévision : un gros achat compte une fois, pour son montant réel.
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
    <button className="min-h-8 text-[15px] font-semibold text-accent" onClick={onClick}>
      {label}
    </button>
  );

  return (
    <Screen
      title={periodLabel(period)}
      subtitle={s.daysLeft > 0 ? `${s.daysLeft} jour${s.daysLeft > 1 ? 's' : ''} restant${s.daysLeft > 1 ? 's' : ''}` : 'Période terminée'}
    >
      {settings.demoMode && (
        <Card className="mb-3 flex items-center gap-3 p-3.5 pl-4">
          <span className="bg-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] text-white" aria-hidden="true">
            <Icon name="sparkles" size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Données exemple</span>
            <span className="block text-[13px] text-label-2">Tes vraies données sont mises de côté.</span>
          </span>
          <Button variant="tinted" size="sm" onClick={() => void backToRealData()}>
            Revenir
          </Button>
        </Card>
      )}
      <BackupBanner />

      {/* Reste à vivre : la carte principale */}
      <button
        onClick={() => setShowBreakdown(true)}
        className="pressable hero relative block w-full overflow-hidden rounded-[28px] p-5 text-left"
        aria-label={`Reste à vivre ${formatMoney(rav)}. Toucher pour le détail du calcul.`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold tracking-[0.09em] text-on-ink-2 uppercase">Reste à vivre</span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/12 text-white/85">
            <Icon name="info" size={15} strokeWidth={2.2} />
          </span>
        </div>
        <p className={`font-rounded mt-2.5 text-[46px] leading-none font-semibold tracking-[-0.035em] ${rav < 0 ? 'text-hero-negative' : 'text-hero-positive'}`}>
          {formatMoney(rav)}
        </p>
        <p className="mt-2.5 text-[15px] text-on-ink-2">
          {rav < 0 ? (
            keepAtEnd > 0 ? (
              <>
                Tu entames les <span className="font-rounded font-semibold text-on-ink">{formatMoney(keepAtEnd)}</span> à garder
              </>
            ) : (
              'Tu as dépensé plus que tes revenus du mois'
            )
          ) : keepAtEnd > 0 ? (
            <>
              en gardant <span className="font-rounded font-semibold text-on-ink">{formatMoney(keepAtEnd)}</span> pour la fin du mois
            </>
          ) : (
            `à dépenser jusqu'au ${formatShortDate(period.end)}`
          )}
        </p>
        <div className="mt-6">
          <div
            className="h-2 overflow-hidden rounded-full bg-white/14"
            role="progressbar"
            aria-valuenow={Math.round(s.engagedPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Part du budget du mois déjà utilisée"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-700 ${
                s.engagedPct >= 100 ? 'bg-hero-negative' : 'bg-gradient-to-r from-white/60 to-white shadow-[0_0_12px_rgba(255,255,255,0.45)]'
              }`}
              style={{ width: `${Math.min(100, s.engagedPct)}%` }}
            />
          </div>
          <div className="mt-2.5 flex justify-between gap-3 text-[12px] text-on-ink-2">
            <span>
              <span className="font-rounded font-semibold text-on-ink">{formatMoney(engaged, { compact: true })}</span> dépensés ou prévus
            </span>
            <span>
              sur <span className="font-rounded font-semibold text-on-ink">{formatMoney(totalIncome - keepAtEnd, { compact: true })}</span>
            </span>
          </div>
        </div>
      </button>

      {/* Revenus, moyenne possible par jour jusqu'à la fin du mois, dépenses ; et où j'en suis aujourd'hui */}
      <Card className="mt-3 overflow-hidden">
        <div className="grid grid-cols-3 divide-x divide-separator pt-4 pb-3.5">
          <Metric label="Revenus" value={<Money cents={totalIncome} compact className="text-positive" />} />
          <Metric
            label="Par jour"
            hint={`jusqu'au ${formatShortDate(period.end)}`}
            value={<Money cents={s.dailyMax} compact className={s.dailyMax > 0 ? 'text-positive' : 'text-negative'} />}
          />
          <Metric label="Dépenses" value={<Money cents={-s.variableSpent} compact className={s.variableSpent ? 'text-negative' : ''} />} />
        </div>
        {s.daysLeft > 0 && <TodayPace spent={s.todayVariable} daily={s.dailyMax} />}
      </Card>

      <div className="h-8" />

      {/* À venir */}
      {upcoming.length > 0 && (
        <Section title="À venir" action={link('Gérer', () => push('recurrings'))}>
          <List inset={68}>
            {upcoming.map((u) => {
              const cat = u.categoryId ? categoryById.get(u.categoryId) : undefined;
              return (
                <div key={`${u.recurringId}-${u.date}`} className="relative flex min-h-[64px] items-center gap-3 px-4 py-2">
                  <Tile emoji={recurrings.find((r) => r.id === u.recurringId)?.emoji ?? cat?.emoji ?? '🔁'} color={cat?.color} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold tracking-[-0.01em]">{u.name}</span>
                    <span className="block text-[13px] text-label-2">
                      {formatShortDate(u.date)} · {inDaysLabel(u.date, today)}
                    </span>
                  </span>
                  <Money
                    cents={u.type === 'income' ? u.amount : -u.amount}
                    sign={u.type === 'income'}
                    className={`text-[15px] font-semibold ${u.type === 'income' ? 'text-positive' : 'text-negative'}`}
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
          <List inset={68}>
            {recent.map((t) => (
              <TxRow key={t.id} tx={t} showDate={formatShortDate(t.date, today)} />
            ))}
          </List>
        ) : (
          <Card className="px-6 py-8 text-center">
            <span className="bg-brand shadow-brand mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[16px] text-white" aria-hidden="true">
              <Icon name="plus" size={24} strokeWidth={2.4} />
            </span>
            <p className="text-[17px] font-semibold">Aucune opération</p>
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
        <List flat className="mb-4" inset={16}>
          <BreakRow label="Revenus reçus" cents={s.income} />
          <BreakRow label="Revenus attendus" cents={s.plannedIncome} />
          <BreakRow label="Abonnements et charges payés" cents={-s.fixedPaid} />
          <BreakRow label="Abonnements et charges à venir" cents={-s.fixedUpcoming} />
          <BreakRow label="Dépenses courantes" cents={-s.variableSpent} />
          <button onClick={() => setEditKeep(true)} className="relative flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left active:bg-fill">
            <span className="text-[15px]">
              À garder en fin de mois <span className="font-medium text-accent">· {keepAtEnd ? 'Modifier' : 'Définir'}</span>
            </span>
            <Money cents={-keepAtEnd} sign colored className="text-[15px]" />
          </button>
          <BreakRow label="Reste à vivre" cents={s.resteAVivre} bold />
        </List>
        {s.daysLeft > 0 && (
          <List flat className="mb-4" inset={16}>
            <div className="relative flex min-h-12 items-center justify-between gap-3 px-4 font-semibold">
              <span className="text-[15px]">
                Par jour{' '}
                <span className="font-normal text-label-2">
                  · {s.daysLeft} jour{s.daysLeft > 1 ? 's' : ''} restant{s.daysLeft > 1 ? 's' : ''}
                </span>
              </span>
              <Money cents={s.dailyMax} className="text-[15px]" />
            </div>
            <div className="relative flex min-h-12 items-center justify-between gap-3 px-4">
              <span className="text-[15px]">Dépensé aujourd'hui</span>
              <Money cents={s.todayVariable} className={`text-[15px] ${s.todayVariable > s.dailyMax ? 'text-negative' : ''}`} />
            </div>
          </List>
        )}
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
            Le montant <strong className="text-label">par jour</strong>, c'est le reste à vivre partagé entre les jours qui restent, aujourd'hui compris. Si tu
            le respectes, tu finis le mois avec {keepAtEnd ? <>au moins {formatMoney(keepAtEnd)}</> : 'un compte qui ne passe pas dans le rouge'}. Il ne
            bouge pas dans la journée et se recalcule chaque matin : si tu dépenses moins un jour, il augmente ; si tu dépenses plus, il baisse.
          </p>
          <p>
            Sur l'accueil, la ligne <strong className="text-label">Aujourd'hui</strong> compare tes dépenses du jour (hors abonnements) à ce montant : en vert
            quand tu es sous la moyenne, en rouge quand tu la dépasses.
          </p>
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
    <div className="min-w-0 px-2.5 text-center">
      <p className="text-[12px] font-medium text-label-2">{label}</p>
      <p className="mt-1 truncate text-[18px] font-semibold tracking-[-0.02em]">{value}</p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-label-2">{hint}</p>}
    </div>
  );
}

/**
 * Où j'en suis aujourd'hui par rapport à la moyenne par jour : dépenses courantes du jour (hors abonnements,
 * déjà déduits) comparées au montant « Par jour », qui ne bouge pas dans la journée.
 */
function TodayPace({ spent, daily }: { spent: Cents; daily: Cents }) {
  const noRoom = daily <= 0;
  const over = spent > daily;
  const bad = noRoom || over;
  const diff = Math.abs(daily - spent);
  const status = noRoom
    ? 'Plus de marge ce mois-ci'
    : spent === daily
      ? 'Pile dans la moyenne'
      : over
        ? `${formatMoney(diff)} au-dessus de la moyenne`
        : `${formatMoney(diff)} sous la moyenne`;
  const icon: IconName = noRoom ? 'alert' : spent === daily ? 'check' : over ? 'arrowUp' : 'arrowDown';
  const pct = daily > 0 ? Math.min(100, (spent / daily) * 100) : spent > 0 ? 100 : 0;
  return (
    <div
      className="border-t border-separator px-4 pt-3 pb-3.5"
      role="group"
      aria-label={`Aujourd'hui : ${formatMoney(spent)} dépensés. ${status}${noRoom ? '' : `, qui est de ${formatMoney(daily)} par jour`}.`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-medium text-label-2">Aujourd'hui</span>
        <Money cents={spent} className="text-[15px] font-semibold" />
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fill" aria-hidden="true">
        <div className={`h-full rounded-full transition-[width] duration-700 ${bad ? 'bg-negative' : 'bg-positive'}`} style={{ width: `${pct}%` }} />
      </div>
      <span
        className={`mt-2.5 inline-flex max-w-full items-center gap-1 rounded-full py-1 pr-2.5 pl-2 text-[12px] font-semibold ${
          bad ? 'bg-negative-soft text-negative' : 'bg-positive-soft text-positive'
        }`}
      >
        <Icon name={icon} size={12} strokeWidth={2.8} className="shrink-0" />
        <span className="truncate">{status}</span>
      </span>
    </div>
  );
}

function BreakRow({ label, cents, bold }: { label: string; cents: number; bold?: boolean }) {
  return (
    <div className={`relative flex min-h-12 items-center justify-between gap-3 px-4 ${bold ? 'font-semibold' : ''}`}>
      <span className="text-[15px]">{label}</span>
      <Money cents={cents} sign colored className="text-[15px]" />
    </div>
  );
}
