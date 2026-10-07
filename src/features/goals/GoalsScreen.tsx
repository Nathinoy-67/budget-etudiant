import { useEffect, useMemo, useState } from 'react';
import { Screen } from '../../components/Screen';
import { Badge, Button, Card, EmptyState, Field, IconButton, List, Money, ProgressBar, Ring, Section, Segmented, TextInput } from '../../components/ui';
import { Sheet } from '../../components/Sheet';
import { AmountSheet } from '../../components/AmountSheet';
import { EmojiPicker } from '../../components/pickers';
import { confirmAction } from '../../components/Overlays';
import { useData } from '../../hooks/useData';
import { useNav } from '../../stores/nav';
import { toast } from '../../stores/ui';
import { goalProgress } from '../../lib/goals';
import { addMonths, formatFullDate, formatMonthYear, formatShortDate } from '../../lib/dates';
import { centsToInput, formatMoney, parseAmount } from '../../lib/money';
import { addContribution, deleteContribution, deleteGoal, saveGoal } from '../../db/actions';
import type { Goal } from '../../types';

const GOAL_IDEAS = [
  { name: 'Permis de conduire', emoji: '🚗', target: 150000 },
  { name: 'Nouveau PC', emoji: '💻', target: 80000 },
  { name: 'Voyage', emoji: '✈️', target: 60000 },
  { name: "Fonds d'urgence", emoji: '🛟', target: 100000 },
  { name: 'Téléphone', emoji: '📱', target: 50000 },
  { name: 'Caution appart', emoji: '🔑', target: 70000 },
];

export function GoalsScreen() {
  const { goals, contributions, today } = useData();
  const push = useNav((s) => s.push);
  const [editing, setEditing] = useState<Partial<Goal> | null>(null);
  const active = goals.filter((g) => !g.archived);
  const archived = goals.filter((g) => g.archived);

  const totals = useMemo(() => {
    let saved = 0;
    let target = 0;
    let monthly = 0;
    for (const g of active) {
      const p = goalProgress(g, contributions, today);
      saved += Math.min(p.saved, g.target);
      target += g.target;
      monthly += p.suggestedMonthly ?? 0;
    }
    return { saved, target, monthly };
  }, [active, contributions, today]);

  return (
    <Screen title="Objectifs" back actions={<IconButton icon="plus" label="Nouvel objectif" onClick={() => setEditing({})} />}>
      {active.length > 0 && (
        <Card className="mb-5 p-4">
          <p className="text-[13px] font-medium text-label-2">Épargné pour tes projets</p>
          <p className="text-[26px] font-bold tracking-tight tabular">
            {formatMoney(totals.saved, { compact: true })}
            <span className="text-[17px] font-medium text-label-2"> / {formatMoney(totals.target, { compact: true })}</span>
          </p>
          <ProgressBar pct={totals.target ? (totals.saved / totals.target) * 100 : 0} color="var(--accent)" className="mt-2" label="Progression totale" />
          {totals.monthly > 0 && (
            <p className="mt-2 text-[14px] text-label-2">
              Pour tout atteindre à temps : <strong className="text-label">{formatMoney(totals.monthly)} / mois</strong>
            </p>
          )}
        </Card>
      )}

      {active.length === 0 ? (
        <>
          <EmptyState icon="target" title="Aucun objectif" text="Fixe-toi un projet : l'appli calcule combien mettre de côté chaque mois." />
          <Section title="Idées">
            <div className="flex flex-wrap gap-2">
              {GOAL_IDEAS.map((g) => (
                <button key={g.name} onClick={() => setEditing({ ...g, targetDate: addMonths(today, 6) })} className="pressable min-h-10 rounded-full bg-card px-3 text-[14px] font-medium">
                  {g.emoji} {g.name}
                </button>
              ))}
            </div>
          </Section>
        </>
      ) : (
        <div className="mb-6 space-y-3">
          {active.map((g) => {
            const p = goalProgress(g, contributions, today);
            return (
              <Card key={g.id} onClick={() => push('goal', { id: g.id })} className="flex items-center gap-4 p-4">
                <Ring pct={p.pct} size={64} stroke={7} color="var(--accent)" label={`${Math.round(p.pct)} %`}>
                  <span className="text-[22px]">{g.emoji}</span>
                </Ring>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[17px] font-semibold">{g.name}</p>
                    {p.reached && <Badge tone="positive">Atteint</Badge>}
                    {p.overdue && <Badge tone="negative">En retard</Badge>}
                  </div>
                  <p className="text-[14px] text-label-2 tabular">
                    {formatMoney(p.saved, { compact: true })} / {formatMoney(g.target, { compact: true })} · {Math.round(p.pct)} %
                  </p>
                  {!p.reached && (
                    <p className="text-[13px] text-label-2">
                      {g.targetDate
                        ? `${formatMoney(p.suggestedMonthly ?? 0)}/mois jusqu'à ${formatMonthYear(g.targetDate)}`
                        : p.eta
                          ? `Au rythme actuel : ${formatMonthYear(p.eta)}`
                          : 'Pas encore de versement'}
                    </p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {archived.length > 0 && (
        <Section title="Terminés / archivés">
          <List>
            {archived.map((g) => (
              <button key={g.id} onClick={() => push('goal', { id: g.id })} className="relative flex min-h-[52px] w-full items-center gap-3 px-4 text-left active:bg-fill">
                <span className="text-[20px]">{g.emoji}</span>
                <span className="flex-1 truncate text-[16px]">{g.name}</span>
                <Money cents={g.target} compact className="text-label-2" />
              </button>
            ))}
          </List>
        </Section>
      )}

      <GoalSheet goal={editing} onClose={() => setEditing(null)} />
    </Screen>
  );
}

export function GoalDetailScreen({ params }: { params?: Record<string, string> }) {
  const { goals, contributions, today } = useData();
  const pop = useNav((s) => s.pop);
  const goal = goals.find((g) => g.id === params?.id);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<'in' | 'out' | null>(null);
  const own = contributions.filter((c) => c.goalId === goal?.id);

  useEffect(() => {
    if (!goal) pop();
  }, [goal, pop]);
  if (!goal) return null;
  const p = goalProgress(goal, contributions, today);

  return (
    <Screen title={goal.name} back actions={<IconButton icon="edit" label="Modifier l'objectif" onClick={() => setEditing(true)} />}>
      <Card className="mb-4 flex flex-col items-center p-5 text-center">
        <Ring pct={p.pct} size={150} stroke={14} color="var(--accent)" label={`${Math.round(p.pct)} % atteint`}>
          <span className="text-[34px]">{goal.emoji}</span>
          <span className="text-[20px] font-bold tabular">{Math.round(p.pct)} %</span>
        </Ring>
        <p className="mt-3 text-[28px] font-bold tracking-tight tabular">{formatMoney(p.saved)}</p>
        <p className="text-[15px] text-label-2">sur {formatMoney(goal.target)}</p>
        {p.reached && <p className="mt-2 text-[17px] font-semibold text-positive">Objectif atteint, bravo !</p>}
      </Card>

      {!p.reached && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <Card className="p-3.5">
            <p className="text-[13px] text-label-2">Reste à épargner</p>
            <Money cents={p.remaining} className="text-[19px] font-bold" />
          </Card>
          <Card className="p-3.5">
            <p className="text-[13px] text-label-2">{goal.targetDate ? 'Versement conseillé' : 'Rythme récent'}</p>
            <p className="text-[19px] font-bold tabular">
              {formatMoney(goal.targetDate ? (p.suggestedMonthly ?? 0) : p.recentMonthlyAverage)}
              <span className="text-[13px] font-medium text-label-2">/mois</span>
            </p>
          </Card>
          <Card className="col-span-2 p-3.5">
            <p className="text-[14px] text-label-2">
              {goal.targetDate ? (
                p.overdue ? (
                  <>La date cible ({formatFullDate(goal.targetDate)}) est dépassée. Modifie-la pour recalculer le versement conseillé.</>
                ) : (
                  <>
                    Date cible : <strong className="text-label">{formatFullDate(goal.targetDate)}</strong> ({p.monthsLeft} mois). En versant{' '}
                    {formatMoney(p.suggestedMonthly ?? 0)} chaque mois, tu y seras pile à temps.
                  </>
                )
              ) : p.eta ? (
                <>
                  Au rythme des 3 derniers mois ({formatMoney(p.recentMonthlyAverage)}/mois), objectif atteint vers{' '}
                  <strong className="text-label">{formatMonthYear(p.eta)}</strong>.
                </>
              ) : (
                'Ajoute un premier versement ou une date cible pour obtenir une estimation.'
              )}
            </p>
            {goal.targetDate && p.recentMonthlyAverage > 0 && p.eta && !p.overdue && (
              <p className="mt-1 text-[14px] text-label-2">
                À ton rythme actuel ({formatMoney(p.recentMonthlyAverage)}/mois) : {formatMonthYear(p.eta)}{' '}
                {p.eta <= goal.targetDate ? '(dans les temps)' : '(un peu tard)'}
              </p>
            )}
          </Card>
        </div>
      )}

      <div className="mb-6 flex gap-2">
        <Button block icon="plus" onClick={() => setAdding('in')}>
          Ajouter
        </Button>
        <Button block variant="secondary" icon="minus" onClick={() => setAdding('out')} disabled={p.saved <= 0}>
          Retirer
        </Button>
      </div>

      <Section title="Historique des versements">
        {own.length === 0 ? (
          <Card className="p-4 text-center text-[15px] text-label-2">Aucun versement pour l'instant.</Card>
        ) : (
          <List>
            {own.map((c) => (
              <div key={c.id} className="relative flex min-h-[52px] items-center gap-3 px-4">
                <span className="flex-1 text-[16px]">
                  {formatShortDate(c.date, today)}
                  {c.note && <span className="text-label-2"> · {c.note}</span>}
                </span>
                <Money cents={c.amount} sign colored className="font-semibold" />
                <IconButton
                  icon="trash"
                  label="Supprimer ce versement"
                  size={18}
                  className="text-label-3"
                  onClick={async () => {
                    if (await confirmAction({ title: 'Supprimer ce versement ?', confirmLabel: 'Supprimer', destructive: true })) await deleteContribution(c.id);
                  }}
                />
              </div>
            ))}
          </List>
        )}
      </Section>
      <p className="px-1 text-[13px] text-label-2">
        Astuce : fais un virement vers ton Livret A (onglet Comptes) puis note-le ici. Les objectifs suivent l'argent que tu mets de côté pour
        chaque projet.
      </p>

      <AmountSheet
        open={!!adding}
        onClose={() => setAdding(null)}
        title={adding === 'out' ? 'Retirer de l’objectif' : 'Ajouter à l’objectif'}
        initial={adding === 'in' && !p.reached ? (p.suggestedMonthly ?? null) : null}
        saveLabel={adding === 'out' ? 'Retirer' : 'Ajouter'}
        onSave={async (cents) => {
          await addContribution({ goalId: goal.id, amount: adding === 'out' ? -Math.min(cents, p.saved) : cents, date: today, note: '' });
          const after = p.saved + (adding === 'out' ? -cents : cents);
          if (adding === 'in' && after >= goal.target && !p.reached) toast(`Objectif « ${goal.name} » atteint !`, { tone: 'success', duration: 4000 });
          else toast(adding === 'out' ? 'Retrait enregistré' : 'Versement enregistré', { tone: 'success' });
        }}
      >
        <p className="text-center text-[15px] text-label-2">
          {goal.emoji} {goal.name} · déjà {formatMoney(p.saved)}
        </p>
      </AmountSheet>
      <GoalSheet goal={editing ? goal : null} onClose={() => setEditing(false)} />
    </Screen>
  );
}

function GoalSheet({ goal, onClose }: { goal: Partial<Goal> | null; onClose: () => void }) {
  const { today } = useData();
  const isEdit = !!goal?.id;
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🎯');
  const [color, setColor] = useState('#5B5BD6');
  const [target, setTarget] = useState('');
  const [hasDate, setHasDate] = useState<'date' | 'none'>('date');
  const [targetDate, setTargetDate] = useState(addMonths(today, 6));

  useEffect(() => {
    if (!goal) return;
    setName(goal.name ?? '');
    setEmoji(goal.emoji ?? '🎯');
    setColor(goal.color ?? '#5B5BD6');
    setTarget(goal.target ? centsToInput(goal.target) : '');
    setHasDate(goal.id && !goal.targetDate ? 'none' : 'date');
    setTargetDate(goal.targetDate ?? addMonths(today, 6));
  }, [goal]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const cents = parseAmount(target);
    if (!name.trim()) return toast("Donne un nom à l'objectif", { tone: 'warning' });
    if (!cents || cents <= 0) return toast('Montant cible invalide', { tone: 'warning' });
    await saveGoal({
      id: goal?.id,
      name: name.trim(),
      emoji,
      color,
      target: cents,
      targetDate: hasDate === 'date' ? targetDate : null,
      archived: goal?.archived ?? false,
    });
    toast(isEdit ? 'Objectif modifié' : 'Objectif créé', { tone: 'success' });
    onClose();
  };

  return (
    <Sheet
      open={!!goal}
      onClose={onClose}
      title={isEdit ? "Modifier l'objectif" : 'Nouvel objectif'}
      right={
        <button className="min-h-11 px-2 text-[17px] font-semibold text-accent" onClick={save}>
          OK
        </button>
      }
    >
      <Field label="Nom">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Permis de conduire" maxLength={40} />}</Field>
      <Field label="Montant cible (€)">{(id) => <TextInput id={id} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="1 500" />}</Field>
      <Segmented
        label="Date cible"
        className="mb-3"
        value={hasDate}
        onChange={setHasDate}
        options={[
          { value: 'date', label: 'Avec date cible' },
          { value: 'none', label: 'Sans date' },
        ]}
      />
      {hasDate === 'date' && (
        <Field label="Date cible">{(id) => <TextInput id={id} type="date" value={targetDate} min={today} onChange={(e) => e.target.value && setTargetDate(e.target.value)} />}</Field>
      )}
      <p className="mb-1.5 px-1 text-[13px] font-medium text-label-2">Icône</p>
      <EmojiPicker value={emoji} onChange={setEmoji} />
      {isEdit && goal?.id && (
        <div className="mt-5 space-y-2">
          <Button variant="secondary" block onClick={() => void saveGoal({ ...(goal as Goal), archived: !goal.archived }).then(onClose)}>
            {goal.archived ? 'Réactiver' : 'Archiver'}
          </Button>
          <Button
            variant="destructive"
            icon="trash"
            block
            onClick={async () => {
              if (await confirmAction({ title: `Supprimer « ${goal.name} » ?`, message: 'Les versements associés seront aussi supprimés.', confirmLabel: 'Supprimer', destructive: true })) {
                await deleteGoal(goal.id!);
                onClose();
              }
            }}
          >
            Supprimer
          </Button>
        </div>
      )}
    </Sheet>
  );
}
