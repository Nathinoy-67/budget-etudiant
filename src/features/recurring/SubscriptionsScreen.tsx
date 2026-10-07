import { useMemo, useState } from 'react';
import { Screen } from '../../components/Screen';
import { Button, Card, EmptyState, IconButton, List, Money, Section } from '../../components/ui';
import { useData } from '../../hooks/useData';
import { buildIcs } from '../../lib/ics';
import { addDays } from '../../lib/dates';
import { saveFile } from '../../lib/files';
import { formatMoney } from '../../lib/money';
import { monthlyEquivalent, nextOccurrence, yearlyEquivalent } from '../../lib/recurrence';
import { toast } from '../../stores/ui';
import { RecurringSheet, type RecurringDraft } from './RecurringSheet';
import { RecurringRow } from './RecurringsScreen';
import type { Recurring } from '../../types';

const PRESETS: RecurringDraft[] = [
  { name: 'Netflix', emoji: '🎬', amount: 799 },
  { name: 'Spotify Étudiant', emoji: '🎵', amount: 599 },
  { name: 'Deezer Étudiant', emoji: '🎧', amount: 599 },
  { name: 'Disney+', emoji: '🏰', amount: 599 },
  { name: 'Amazon Prime Student', emoji: '📦', amount: 349 },
  { name: 'Forfait mobile', emoji: '📱', amount: 999 },
  { name: 'Box internet', emoji: '🌐', amount: 2999 },
  { name: 'Salle de sport', emoji: '💪', amount: 2499 },
  { name: 'iCloud+', emoji: '☁️', amount: 99 },
  { name: 'Xbox / PlayStation', emoji: '🎮', amount: 999 },
];

export function SubscriptionsScreen() {
  const { recurrings, today } = useData();
  const [selected, setSelected] = useState<Recurring | null>(null);
  const [draft, setDraft] = useState<RecurringDraft | null>(null);
  const subs = useMemo(() => recurrings.filter((r) => r.isSubscription), [recurrings]);
  const active = subs.filter((r) => r.active);

  const monthly = active.reduce((s, r) => s + monthlyEquivalent(r.amount, r.frequency, r.interval), 0);
  const yearly = active.reduce((s, r) => s + yearlyEquivalent(r.amount, r.frequency, r.interval), 0);
  const sorted = [...subs].sort((a, b) => {
    const na = (a.active && nextOccurrence(a, today)) || '9999';
    const nb = (b.active && nextOccurrence(b, today)) || '9999';
    return na < nb ? -1 : na > nb ? 1 : 0;
  });

  const exportCalendar = async () => {
    const events = active.flatMap((r) => {
      const next = nextOccurrence(r, today);
      if (!next) return [];
      const rule = { weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }[r.frequency];
      const day = Number(r.startDate.slice(8));
      // Le 29-31 n'existe pas tous les mois : on cale la répétition sur le dernier jour
      const byDay = r.frequency === 'monthly' && day > 28 ? ';BYMONTHDAY=-1' : '';
      return [
        {
          uid: `sub-${r.id}`,
          title: `${r.emoji ?? '🔁'} ${r.name} (${formatMoney(r.amount)})`,
          description: 'Renouvellement d’abonnement — Budget Étudiant',
          date: next,
          time: '10:00',
          rrule: `FREQ=${rule};INTERVAL=${r.interval}${byDay}${r.endDate ? `;UNTIL=${r.endDate.replace(/-/g, '')}` : ''}`,
          alarmMinutesBefore: r.remindDaysBefore * 24 * 60,
        },
      ];
    });
    if (!events.length) return toast('Aucun abonnement actif', { tone: 'warning' });
    const res = await saveFile(buildIcs(events), 'abonnements.ics', 'text/calendar');
    if (res !== 'cancelled') toast('Ouvre le fichier pour l’ajouter à ton Calendrier', { duration: 4000 });
  };

  const soon = active.filter((r) => {
    const n = nextOccurrence(r, today);
    return n && n <= addDays(today, 7);
  });

  return (
    <Screen title="Abonnements" back actions={<IconButton icon="plus" label="Nouvel abonnement" onClick={() => setDraft({ isSubscription: true, type: 'expense' })} />}>
      <Card className="mb-5 grid grid-cols-2 divide-x divide-separator p-4 text-center">
        <div>
          <p className="text-[13px] text-label-2">Par mois</p>
          <Money cents={monthly} className="text-[24px] font-bold tracking-tight" />
        </div>
        <div>
          <p className="text-[13px] text-label-2">Par an</p>
          <Money cents={yearly} className="text-[24px] font-bold tracking-tight" />
        </div>
      </Card>
      {soon.length > 0 && (
        <p className="-mt-2 mb-4 rounded-xl bg-warning-soft px-3.5 py-2.5 text-[14px]">
          {soon.length} renouvellement{soon.length > 1 ? 's' : ''} dans les 7 prochains jours.
        </p>
      )}

      {subs.length === 0 ? (
        <EmptyState icon="card" title="Aucun abonnement" text="Ajoute tes abonnements pour voir combien ils te coûtent vraiment sur l'année." />
      ) : (
        <Section title={`${active.length} actif${active.length > 1 ? 's' : ''}`}>
          <List>
            {sorted.map((r) => (
              <RecurringRow key={r.id} r={r} onClick={() => setSelected(r)} />
            ))}
          </List>
        </Section>
      )}

      <Section title="Ajout rapide">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => setDraft({ ...p, isSubscription: true, type: 'expense' })}
              className="pressable min-h-10 rounded-full bg-card px-3 text-[14px] font-medium"
            >
              {p.emoji} {p.name}
            </button>
          ))}
        </div>
      </Section>

      <Button variant="tinted" icon="calendar" block onClick={exportCalendar} className="mb-2">
        Ajouter les rappels au Calendrier
      </Button>
      <p className="px-1 text-[13px] text-label-2">
        L'appli t'alerte à l'ouverture avant chaque renouvellement. Pour une alerte même appli fermée, ajoute les échéances à ton Calendrier
        iPhone (rappel le nombre de jours choisi avant).
      </p>

      <RecurringSheet
        open={!!selected || !!draft}
        recurring={selected}
        draft={draft}
        onClose={() => {
          setSelected(null);
          setDraft(null);
        }}
      />
    </Screen>
  );
}
