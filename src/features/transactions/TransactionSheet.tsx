import { useEffect, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { Keypad } from '../../components/Keypad';
import { CategoryGrid } from '../../components/pickers';
import { Button, Segmented, Toggle } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useData } from '../../hooks/useData';
import { useTxSheet, toast } from '../../stores/ui';
import { addDays, formatShortDate, isValidISO, relativeDayLabel } from '../../lib/dates';
import { centsToInput, formatMoney, parseAmount } from '../../lib/money';
import { haptic } from '../../lib/haptics';
import { addRecurring, addTransaction, deleteTransaction, makeRecurringFrom, restoreTransactions, stopRecurring, updateTransaction } from '../../db/actions';
import { learnMerchantCategory } from '../applepay/receive';
import type { Frequency, ID, ISODate } from '../../types';

type Kind = 'expense' | 'income';

const NEW_LABEL: Record<Kind, string> = { expense: 'Nouvelle dépense', income: 'Nouveau revenu' };
const ADDED_LABEL: Record<Kind, string> = { expense: 'Dépense ajoutée', income: 'Revenu ajouté' };
const RECURRING_LABEL: Record<Kind, string> = { expense: 'Abonnement enregistré : déduit chaque mois', income: 'Revenu régulier enregistré' };
const REPEAT_LABEL: Record<Kind, string> = { expense: "C'est un abonnement", income: 'Revenu régulier' };
const REPEAT_HINT: Record<Kind, string> = {
  expense: 'Déduit de ton reste à vivre à chaque échéance, même avant le prélèvement',
  income: 'Compté dans tes revenus à chaque échéance',
};

/** Saisie d'une dépense ou d'un revenu (tout passe par le compte courant). */
export function TransactionSheet() {
  const data = useData();
  const { open, editing, preset, close } = useTxSheet();
  const { categories, accounts, settings, today, transactions, recurrings } = data;

  const [type, setType] = useState<Kind>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<ID | null>(null);
  const [date, setDate] = useState<ISODate>(today);
  const [note, setNote] = useState('');
  const [repeat, setRepeat] = useState(false);
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [saving, setSaving] = useState(false);

  const accountId = settings.defaultAccountId ?? accounts.find((a) => !a.archived)?.id ?? accounts[0]?.id ?? null;

  /** Catégorie la plus utilisée sur 30 jours, pré-sélectionnée. */
  const favoriteCategory = (kind: Kind): ID | null => {
    const since = addDays(today, -30);
    const counts = new Map<ID, number>();
    for (const t of transactions) {
      if (t.date < since) break; // triées par date décroissante
      if (t.type === kind && t.categoryId && !t.recurringId) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const valid = categories.filter((c) => c.kind === kind && !c.archived);
    return best && valid.some((c) => c.id === best) ? best : (valid[0]?.id ?? null);
  };

  // Initialisation à chaque ouverture
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setType(editing.type === 'income' ? 'income' : 'expense');
      setAmount(centsToInput(editing.amount));
      setCategoryId(editing.categoryId);
      setDate(editing.date);
      setNote(editing.note);
    } else {
      const t: Kind = preset?.type === 'income' ? 'income' : 'expense';
      setType(t);
      setAmount(preset?.amount ? centsToInput(preset.amount) : '');
      setCategoryId(preset?.categoryId ?? favoriteCategory(t));
      setDate(preset?.date ?? today);
      setNote(preset?.note ?? '');
    }
    setRepeat(false);
    setFrequency('monthly');
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, preset]);

  const changeType = (t: Kind) => {
    setType(t);
    const cat = categoryId ? data.categoryById.get(categoryId) : null;
    if (!cat || cat.kind !== t) setCategoryId(favoriteCategory(t));
  };

  const cents = parseAmount(amount || '0') ?? 0;
  const kindCategories = categories.filter((c) => c.kind === type && (!c.archived || c.id === categoryId));
  const canSave = cents > 0 && !!accountId && isValidISO(date) && !saving;

  const save = async () => {
    if (!canSave || !accountId) {
      haptic('error');
      if (cents <= 0) toast('Saisis un montant', { tone: 'warning' });
      return;
    }
    setSaving(true);
    const finalCat = categoryId ?? favoriteCategory(type);
    const payload = { type, amount: cents, date, categoryId: finalCat, accountId, toAccountId: null, note: note.trim() };
    try {
      if (editing) {
        await updateTransaction(editing.id, payload);
        // Correction de catégorie d'un paiement Apple Pay : on retient le choix pour ce commerçant
        if ((editing.source === 'applepay' || editing.source === 'import') && editing.merchant && payload.categoryId !== editing.categoryId)
          void learnMerchantCategory(data, editing.merchant, payload.categoryId);
        if (repeat && !editing.recurringId) {
          // Marquée « abonnement » : cette opération devient la 1re échéance, les suivantes sont déduites d'avance
          const cat = payload.categoryId ? data.categoryById.get(payload.categoryId) : null;
          await makeRecurringFrom({ ...editing, ...payload }, { frequency, name: payload.note || cat?.name || NEW_LABEL[type], emoji: cat?.emoji });
          haptic('success');
          toast(RECURRING_LABEL[type], { tone: 'success' });
        } else {
          haptic('success');
          toast('Opération modifiée', { tone: 'success' });
        }
      } else if (repeat) {
        const cat = finalCat ? data.categoryById.get(finalCat) : null;
        await addRecurring({
          ...payload,
          name: payload.note || cat?.name || NEW_LABEL[type],
          frequency,
          interval: 1,
          startDate: date,
          endDate: null,
          active: true,
          isSubscription: type === 'expense',
          remindDaysBefore: 0,
          emoji: cat?.emoji,
        });
        haptic('success');
        toast(RECURRING_LABEL[type], { tone: 'success' });
      } else {
        const tx = await addTransaction({ ...payload, recurringId: null, occurrence: null });
        haptic('success');
        toast(`${ADDED_LABEL[type]} · ${formatMoney(cents)}`, {
          action: { label: 'Annuler', onClick: () => void deleteTransaction(tx.id) },
        });
      }
      close();
    } catch (e) {
      console.error(e);
      toast("Impossible d'enregistrer", { tone: 'error' });
      setSaving(false);
    }
  };

  const linked = editing?.recurringId ? recurrings.find((r) => r.id === editing.recurringId) : undefined;
  const linkedStopped = !!linked && (!linked.active || (!!linked.endDate && linked.endDate <= today));
  const stop = async () => {
    if (!linked) return;
    await stopRecurring(linked.id, today);
    haptic('medium');
    toast(type === 'expense' ? 'Abonnement arrêté : il ne sera plus déduit' : 'Revenu régulier arrêté', { tone: 'success' });
  };

  const remove = async () => {
    if (!editing) return;
    const removed = await deleteTransaction(editing.id);
    haptic('medium');
    close();
    if (removed) toast('Opération supprimée', { action: { label: 'Annuler', onClick: () => void restoreTransactions([removed]) } });
  };

  const quickDates: { label: string; value: ISODate }[] = [
    { label: "Aujourd'hui", value: today },
    { label: 'Hier', value: addDays(today, -1) },
  ];
  const customDate = !quickDates.some((d) => d.value === date);

  return (
    <Sheet
      open={open}
      onClose={close}
      full
      title={editing ? 'Modifier' : NEW_LABEL[type]}
      footer={
        <div>
          <Keypad value={amount} onChange={setAmount} compact />
          <div className="mt-2 flex gap-2">
            {editing && <Button variant="destructive" icon="trash" onClick={remove} aria-label="Supprimer l'opération" className="px-4" />}
            <Button block onClick={save} disabled={!canSave}>
              {editing ? 'Enregistrer' : `Ajouter ${cents > 0 ? formatMoney(cents) : ''}`}
            </Button>
          </div>
        </div>
      }
    >
      <Segmented
        label="Type d'opération"
        value={type}
        onChange={changeType}
        options={[
          { value: 'expense', label: 'Dépense' },
          { value: 'income', label: 'Revenu' },
        ]}
      />

      <div className="my-4 text-center" aria-live="polite">
        <span
          className={`text-[44px] leading-none font-semibold tracking-[-0.03em] tabular ${type === 'income' ? 'text-positive' : 'text-label'} ${amount ? '' : 'opacity-25'}`}
        >
          {type === 'expense' && amount ? '−' : type === 'income' && amount ? '+' : ''}
          {amount || '0'}
          <span className="ml-1 text-[30px]">{formatMoney(0).replace(/[\d\s,.  ]/g, '') || '€'}</span>
        </span>
      </div>

      <CategoryGrid categories={kindCategories} value={categoryId} onChange={setCategoryId} />

      {/* Date */}
      <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4" role="radiogroup" aria-label="Date">
        {quickDates.map((d) => (
          <button
            key={d.value}
            role="radio"
            aria-checked={date === d.value}
            onClick={() => setDate(d.value)}
            className={`min-h-10 shrink-0 rounded-full px-3.5 text-[14px] font-medium ${date === d.value ? 'bg-label text-bg' : 'bg-fill'}`}
          >
            {d.label}
          </button>
        ))}
        <label className={`relative flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-medium ${customDate ? 'bg-label text-bg' : 'bg-fill'}`}>
          <Icon name="calendar" size={16} />
          {customDate ? relativeDayLabel(date, today) : 'Autre date'}
          <input
            type="date"
            value={date}
            max={addDays(today, 366)}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="absolute inset-0 opacity-0"
            aria-label="Choisir une date"
          />
        </label>
      </div>

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (facultatif)"
        aria-label="Note"
        maxLength={120}
        enterKeyHint="done"
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="mt-3 min-h-11 w-full rounded-xl bg-fill px-3.5 text-[16px] placeholder:text-label-3"
      />

      {editing?.recurringId ? (
        <div className="mt-3 flex min-h-12 items-center gap-3 rounded-xl bg-fill px-3.5 py-2">
          <Icon name="repeat" size={18} className="shrink-0 text-label-2" />
          <span className="min-w-0 flex-1 text-[14px] text-label-2">
            {linked
              ? `${linked.isSubscription ? 'Abonnement' : type === 'income' ? 'Revenu régulier' : 'Charge fixe'} · ${formatMoney(linked.amount)}${linkedStopped ? ' · arrêté' : ''}`
              : 'Opération récurrente'}
            <span className="block text-[12px] text-label-3">La modifier ici ne change que celle-ci.</span>
          </span>
          {linked && !linkedStopped && (
            <button onClick={() => void stop()} className="min-h-10 shrink-0 px-1 text-[15px] font-medium text-negative">
              Arrêter
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3 rounded-xl bg-fill px-3.5 py-1.5">
          <div className="flex min-h-10 items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-[15px]">{REPEAT_LABEL[type]}</span>
              {!repeat && <span className="block text-[12px] text-label-2">{REPEAT_HINT[type]}</span>}
            </span>
            <Toggle checked={repeat} onChange={setRepeat} label={REPEAT_LABEL[type]} />
          </div>
          {repeat && (
            <div className="pt-1 pb-2">
              <Segmented
                label="Fréquence"
                value={frequency}
                onChange={setFrequency}
                options={[
                  { value: 'monthly', label: 'Chaque mois' },
                  { value: 'yearly', label: 'Chaque année' },
                  { value: 'weekly', label: 'Chaque semaine' },
                ]}
              />
              <p className="mt-2 text-[13px] text-label-2">
                {editing ? 'Cette opération' : `Le ${formatShortDate(date, today)}`} compte comme 1re échéance ; les suivantes sont{' '}
                {type === 'expense' ? 'déduites de ton reste à vivre dès le début de chaque mois' : 'comptées dans tes revenus attendus'}.
              </p>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
