import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { Button, Field, Segmented, Select, TextInput, Toggle } from '../../components/ui';
import { CategoryGrid } from '../../components/pickers';
import { confirmAction } from '../../components/Overlays';
import { useData } from '../../hooks/useData';
import { toast } from '../../stores/ui';
import { centsToInput, formatMoney, parseAmount } from '../../lib/money';
import { formatShortDate, inDaysLabel, isValidISO } from '../../lib/dates';
import { frequencyLabel, upcomingOccurrences } from '../../lib/recurrence';
import { addRecurring, deleteRecurring, skipOccurrence, unskipOccurrence, updateRecurring } from '../../db/actions';
import { haptic } from '../../lib/haptics';
import type { Frequency, ID, Recurring, TxType } from '../../types';

export interface RecurringDraft {
  type?: TxType;
  isSubscription?: boolean;
  name?: string;
  amount?: number;
  emoji?: string;
  categoryId?: ID | null;
}

export function RecurringSheet({
  recurring,
  draft,
  open,
  onClose,
}: {
  recurring: Recurring | null;
  draft?: RecurringDraft | null;
  open: boolean;
  onClose: () => void;
}) {
  const { categories, accounts, settings, today, recurrings } = useData();
  const live = recurring ? (recurrings.find((r) => r.id === recurring.id) ?? recurring) : null;
  const activeAccounts = accounts.filter((a) => !a.archived);

  const [type, setType] = useState<TxType>('expense');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<ID | null>(null);
  const [accountId, setAccountId] = useState<ID | null>(null);
  const [toAccountId, setToAccountId] = useState<ID | null>(null);
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [interval, setEvery] = useState(1);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState('');
  const [isSubscription, setIsSubscription] = useState(false);
  const [emoji, setEmoji] = useState('');

  useEffect(() => {
    if (!open) return;
    const r = recurring;
    const t = r?.type ?? draft?.type ?? 'expense';
    setType(t);
    setName(r?.name ?? draft?.name ?? '');
    setAmount(r ? centsToInput(r.amount) : draft?.amount ? centsToInput(draft.amount) : '');
    const fallbackCat =
      draft?.isSubscription && t === 'expense'
        ? (categories.find((c) => c.name === 'Abonnements' && !c.archived)?.id ?? null)
        : (categories.find((c) => c.kind === t && !c.archived)?.id ?? null);
    setCategoryId(r?.categoryId ?? draft?.categoryId ?? (t === 'transfer' ? null : fallbackCat));
    setAccountId(r?.accountId ?? settings.defaultAccountId ?? activeAccounts[0]?.id ?? null);
    setToAccountId(r?.toAccountId ?? activeAccounts.find((a) => a.id !== (r?.accountId ?? settings.defaultAccountId))?.id ?? null);
    setFrequency(r?.frequency ?? 'monthly');
    setEvery(r?.interval ?? 1);
    setStartDate(r?.startDate ?? today);
    setEndDate(r?.endDate ?? '');
    setIsSubscription(r?.isSubscription ?? draft?.isSubscription ?? false);
    setEmoji(r?.emoji ?? draft?.emoji ?? '');
  }, [open, recurring, draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const upcoming = useMemo(() => (live ? upcomingOccurrences(live, today, 6) : []), [live, today]);
  const cents = parseAmount(amount || '0') ?? 0;
  const kindCats = categories.filter((c) => c.kind === (type === 'income' ? 'income' : 'expense') && (!c.archived || c.id === categoryId));

  const save = async () => {
    if (!name.trim()) return toast('Donne un nom (ex. Loyer, Netflix)', { tone: 'warning' });
    if (cents <= 0) return toast('Saisis un montant', { tone: 'warning' });
    if (!accountId) return toast('Choisis un compte', { tone: 'warning' });
    if (!isValidISO(startDate)) return toast('Date invalide', { tone: 'warning' });
    if (endDate && endDate < startDate) return toast('La date de fin est avant le début', { tone: 'warning' });
    const cat = categoryId ? categories.find((c) => c.id === categoryId) : null;
    const payload = {
      name: name.trim(),
      type,
      amount: cents,
      categoryId: type === 'transfer' ? null : categoryId,
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : null,
      frequency,
      interval,
      startDate,
      endDate: endDate || null,
      isSubscription: type === 'expense' && isSubscription,
      remindDaysBefore: 0,
      emoji: emoji || cat?.emoji || (type === 'transfer' ? '🔁' : undefined),
      active: live?.active ?? true,
    };
    if (live) {
      await updateRecurring(live.id, payload);
      toast('Modifié (les échéances futures utiliseront ces valeurs)', { tone: 'success' });
    } else {
      await addRecurring(payload);
      toast(startDate <= today ? 'Créée — les échéances passées ont été ajoutées' : 'Opération récurrente créée', { tone: 'success' });
    }
    haptic('success');
    onClose();
  };

  const remove = async () => {
    if (!live) return;
    const ok = await confirmAction({
      title: `Supprimer « ${live.name} » ?`,
      message: 'Les opérations déjà passées restent dans ton historique.',
      confirmLabel: 'Supprimer',
      destructive: true,
    });
    if (!ok) return;
    await deleteRecurring(live.id, false);
    toast('Supprimée');
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      full
      title={live ? 'Modifier' : isSubscription ? 'Nouvel abonnement' : 'Nouvelle récurrence'}
      right={
        <button className="min-h-11 px-2 text-[17px] font-semibold text-accent" onClick={save}>
          OK
        </button>
      }
    >
      {!draft?.isSubscription && (
        <Segmented
          label="Type"
          className="mb-4"
          value={type}
          onChange={(t) => {
            setType(t);
            setCategoryId(categories.find((c) => c.kind === t && !c.archived)?.id ?? null);
          }}
          options={[
            { value: 'expense', label: 'Charge' },
            { value: 'income', label: 'Revenu' },
          ]}
        />
      )}

      <Field label="Nom">
        {(id) => (
          <TextInput
            id={id}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={type === 'income' ? 'Ex. Salaire, APL, Bourse' : 'Ex. Loyer, Netflix'}
            maxLength={50}
          />
        )}
      </Field>
      <div className="grid grid-cols-[1fr_80px] gap-2">
        <Field label="Montant (€)">
          {(id) => <TextInput id={id} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />}
        </Field>
        <Field label="Emoji">
          {(id) => <TextInput id={id} value={emoji} onChange={(e) => setEmoji([...new Intl.Segmenter().segment(e.target.value)].pop()?.segment ?? '')} placeholder="🔁" className="text-center" />}
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Fréquence">
          {(id) => (
            <Select id={id} value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
              <option value="weekly">Hebdomadaire</option>
              <option value="monthly">Mensuelle</option>
              <option value="yearly">Annuelle</option>
            </Select>
          )}
        </Field>
        <Field label="Tous les…">
          {(id) => (
            <Select id={id} value={interval} onChange={(e) => setEvery(Number(e.target.value))}>
              {[1, 2, 3, 4, 6, 12].map((n) => (
                <option key={n} value={n}>
                  {frequencyLabel(frequency, n)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={live ? 'Date de départ' : 'Première échéance'}>
          {(id) => <TextInput id={id} type="date" value={startDate} onChange={(e) => e.target.value && setStartDate(e.target.value)} />}
        </Field>
        <Field label="Fin (facultatif)">
          {(id) => <TextInput id={id} type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />}
        </Field>
      </div>
      {frequency === 'monthly' && Number(startDate.slice(8)) > 28 && (
        <p className="-mt-1 mb-3 px-1 text-[12px] text-label-2">Les mois plus courts, l'échéance tombera le dernier jour du mois.</p>
      )}

      <p className="mb-1.5 px-1 text-[13px] font-medium text-label-2">Catégorie</p>
      <div className="mb-4">
        <CategoryGrid categories={kindCats} value={categoryId} onChange={setCategoryId} />
      </div>

      {type === 'expense' && (
        <div className="mb-4 rounded-xl bg-fill px-3.5 py-2">
          <div className="flex min-h-11 items-center justify-between">
            <span className="text-[16px]">C'est un abonnement</span>
            <Toggle checked={isSubscription} onChange={setIsSubscription} label="C'est un abonnement" />
          </div>
        </div>
      )}

      {live && (
        <>
          <div className="mb-4 flex min-h-12 items-center justify-between rounded-xl bg-fill px-3.5">
            <span className="text-[16px]">{live.active ? 'Active' : 'En pause'}</span>
            <Toggle
              checked={live.active}
              onChange={(v) => void updateRecurring(live.id, { active: v }).then(() => toast(v ? 'Reprise' : 'Mise en pause'))}
              label="Activer cette récurrence"
            />
          </div>

          {live.active && upcoming.length > 0 && (
            <>
              <p className="mb-1.5 px-1 text-[13px] font-medium text-label-2">Prochaines échéances</p>
              <div className="mb-4 overflow-hidden rounded-xl bg-fill">
                {upcoming.map((d) => {
                  const skipped = live.skipped.includes(d);
                  return (
                    <div key={d} className="flex min-h-12 items-center justify-between border-b border-separator px-3.5 last:border-0">
                      <span className={`text-[15px] ${skipped ? 'text-label-3 line-through' : ''}`}>
                        {formatShortDate(d, today)} <span className="text-label-2">· {inDaysLabel(d, today)}</span>
                      </span>
                      <button
                        onClick={() => {
                          haptic('light');
                          void (skipped ? unskipOccurrence(live.id, d) : skipOccurrence(live.id, d)).then(() =>
                            toast(skipped ? 'Échéance rétablie' : `Échéance du ${formatShortDate(d)} sautée`),
                          );
                        }}
                        className="min-h-10 px-2 text-[15px] font-medium text-accent"
                      >
                        {skipped ? 'Rétablir' : 'Sauter'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          <p className="mb-4 px-1 text-[13px] text-label-2">
            {frequencyLabel(live.frequency, live.interval)} · {formatMoney(live.amount)} · créée le {new Date(live.createdAt).toLocaleDateString('fr-FR')}
          </p>
          <Button variant="destructive" icon="trash" block onClick={remove}>
            Supprimer la récurrence
          </Button>
        </>
      )}
    </Sheet>
  );
}
