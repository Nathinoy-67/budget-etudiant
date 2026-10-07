import { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { Keypad } from '../../components/Keypad';
import { AccountChips, CategoryGrid } from '../../components/pickers';
import { Button, Segmented, Toggle } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useData } from '../../hooks/useData';
import { useTxSheet, toast } from '../../stores/ui';
import { addDays, formatShortDate, isValidISO, relativeDayLabel } from '../../lib/dates';
import { centsToInput, formatMoney, parseAmount } from '../../lib/money';
import { haptic } from '../../lib/haptics';
import { addRecurring, addTransaction, deleteTransaction, restoreTransactions, updateTransaction } from '../../db/actions';
import { checkBudgetAfterChange } from '../alerts';
import type { Frequency, ID, ISODate, TxType } from '../../types';

const TYPE_LABEL: Record<TxType, string> = { expense: 'Dépense', income: 'Revenu', transfer: 'Virement' };
// Accords en genre : « Nouvelle dépense » mais « Nouveau revenu »
const NEW_LABEL: Record<TxType, string> = { expense: 'Nouvelle dépense', income: 'Nouveau revenu', transfer: 'Nouveau virement' };
const ADDED_LABEL: Record<TxType, string> = { expense: 'Dépense ajoutée', income: 'Revenu ajouté', transfer: 'Virement ajouté' };
const RECURRING_LABEL: Record<TxType, string> = { expense: 'Dépense récurrente créée', income: 'Revenu récurrent créé', transfer: 'Virement récurrent créé' };

export function TransactionSheet() {
  const data = useData();
  const { open, editing, preset, close } = useTxSheet();
  const { categories, accounts, settings, today, transactions } = data;

  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<ID | null>(null);
  const [accountId, setAccountId] = useState<ID | null>(null);
  const [toAccountId, setToAccountId] = useState<ID | null>(null);
  const [date, setDate] = useState<ISODate>(today);
  const [note, setNote] = useState('');
  const [repeat, setRepeat] = useState(false);
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [saving, setSaving] = useState(false);
  const dateInput = useRef<HTMLInputElement>(null);

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
  const defaultAccount = settings.defaultAccountId ?? activeAccounts[0]?.id ?? null;

  /** Catégorie la plus utilisée sur 30 jours, pour pré-sélectionner (ajout en 2 taps). */
  const favoriteCategory = (kind: 'expense' | 'income'): ID | null => {
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
      setType(editing.type);
      setAmount(centsToInput(editing.amount));
      setCategoryId(editing.categoryId);
      setAccountId(editing.accountId);
      setToAccountId(editing.toAccountId ?? null);
      setDate(editing.date);
      setNote(editing.note);
    } else {
      const t = preset?.type ?? 'expense';
      setType(t);
      setAmount(preset?.amount ? centsToInput(preset.amount) : '');
      setCategoryId(preset?.categoryId ?? (t === 'transfer' ? null : favoriteCategory(t)));
      setAccountId(preset?.accountId ?? defaultAccount);
      setToAccountId(preset?.toAccountId ?? activeAccounts.find((a) => a.id !== (preset?.accountId ?? defaultAccount))?.id ?? null);
      setDate(preset?.date ?? today);
      setNote(preset?.note ?? '');
    }
    setRepeat(false);
    setFrequency('monthly');
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, preset]);

  const changeType = (t: TxType) => {
    setType(t);
    if (t !== 'transfer') {
      const cat = categoryId ? data.categoryById.get(categoryId) : null;
      if (!cat || cat.kind !== t) setCategoryId(favoriteCategory(t));
    } else if (!toAccountId || toAccountId === accountId) {
      setToAccountId(activeAccounts.find((a) => a.id !== accountId)?.id ?? null);
    }
  };

  const cents = parseAmount(amount || '0') ?? 0;
  const kindCategories = categories.filter((c) => c.kind === (type === 'income' ? 'income' : 'expense') && (!c.archived || c.id === categoryId));
  const canSave =
    cents > 0 &&
    !!accountId &&
    (type !== 'transfer' || (!!toAccountId && toAccountId !== accountId)) &&
    isValidISO(date) &&
    !saving;

  const save = async () => {
    if (!canSave || !accountId) {
      haptic('error');
      if (cents <= 0) toast('Saisis un montant', { tone: 'warning' });
      else if (type === 'transfer') toast('Choisis deux comptes différents', { tone: 'warning' });
      return;
    }
    setSaving(true);
    const fallbackCat = type === 'transfer' ? null : (categoryId ?? favoriteCategory(type));
    const payload = {
      type,
      amount: cents,
      date,
      categoryId: fallbackCat,
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : null,
      note: note.trim(),
    };
    try {
      if (editing) {
        await updateTransaction(editing.id, payload);
        haptic('success');
        toast('Opération modifiée', { tone: 'success' });
        void checkBudgetAfterChange(data, { ...editing, ...payload }, editing);
      } else if (repeat) {
        const cat = fallbackCat ? data.categoryById.get(fallbackCat) : null;
        await addRecurring({
          ...payload,
          name: payload.note || cat?.name || TYPE_LABEL[type],
          frequency,
          interval: 1,
          startDate: date,
          endDate: null,
          active: true,
          isSubscription: false,
          remindDaysBefore: 2,
          emoji: cat?.emoji,
        });
        haptic('success');
        toast(RECURRING_LABEL[type], { tone: 'success' });
      } else {
        const tx = await addTransaction({ ...payload, recurringId: null, occurrence: null });
        haptic('success');
        toast(`${ADDED_LABEL[type]} · ${formatMoney(cents)}`, {
          action: {
            label: 'Annuler',
            onClick: () => {
              void deleteTransaction(tx.id);
            },
          },
        });
        void checkBudgetAfterChange(data, tx);
      }
      close();
    } catch (e) {
      console.error(e);
      toast("Impossible d'enregistrer", { tone: 'error' });
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    const removed = await deleteTransaction(editing.id);
    haptic('medium');
    close();
    if (removed)
      toast('Opération supprimée', { action: { label: 'Annuler', onClick: () => void restoreTransactions([removed]) } });
  };

  const amountColor = type === 'income' ? 'text-positive' : type === 'transfer' ? 'text-accent' : 'text-label';
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
      right={
        <button className="min-h-11 px-2 text-[17px] font-semibold text-accent disabled:opacity-40" onClick={save} disabled={!canSave}>
          {editing ? 'OK' : 'Ajouter'}
        </button>
      }
      footer={
        <div>
          <Keypad value={amount} onChange={setAmount} compact />
          <div className="mt-2 flex gap-2">
            {editing && (
              <Button variant="destructive" icon="trash" onClick={remove} aria-label="Supprimer l'opération" className="px-4" />
            )}
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
          { value: 'transfer', label: 'Virement' },
        ]}
      />

      <div className="my-3 text-center" aria-live="polite">
        <span className={`text-[44px] leading-none font-bold tracking-tight tabular ${amountColor} ${amount ? '' : 'opacity-30'}`}>
          {type === 'expense' && amount ? '−' : type === 'income' && amount ? '+' : ''}
          {amount || '0'}
          <span className="ml-1 text-[30px]">{formatMoney(0).replace(/[\d\s,.  ]/g, '') || '€'}</span>
        </span>
      </div>

      {type !== 'transfer' ? (
        <CategoryGrid categories={kindCategories} value={categoryId} onChange={setCategoryId} />
      ) : (
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-label-2">Depuis</p>
            <AccountChips accounts={activeAccounts} value={accountId} onChange={setAccountId} label="Compte source" />
          </div>
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-label-2">Vers</p>
            <AccountChips accounts={activeAccounts} value={toAccountId} onChange={setToAccountId} exclude={accountId} label="Compte de destination" />
          </div>
        </div>
      )}

      {/* Date */}
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4" role="radiogroup" aria-label="Date">
        {quickDates.map((d) => (
          <button
            key={d.value}
            role="radio"
            aria-checked={date === d.value}
            onClick={() => setDate(d.value)}
            className={`min-h-11 shrink-0 rounded-full px-3.5 text-[15px] font-medium ${date === d.value ? 'bg-accent text-white' : 'bg-fill'}`}
          >
            {d.label}
          </button>
        ))}
        <label
          className={`relative flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-medium ${customDate ? 'bg-accent text-white' : 'bg-fill'}`}
        >
          <Icon name="calendar" size={17} />
          {customDate ? relativeDayLabel(date, today).replace(/^./, (c) => c.toUpperCase()) : 'Autre date'}
          <input
            ref={dateInput}
            type="date"
            value={date}
            max={addDays(today, 366)}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="absolute inset-0 opacity-0"
            aria-label="Choisir une date"
          />
        </label>
      </div>

      {/* Compte */}
      {type !== 'transfer' && activeAccounts.length > 1 && (
        <div className="mt-3">
          <AccountChips accounts={activeAccounts} value={accountId} onChange={setAccountId} />
        </div>
      )}

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (facultatif)"
        aria-label="Note"
        maxLength={120}
        enterKeyHint="done"
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="mt-3 min-h-12 w-full rounded-xl bg-fill px-3.5 text-[16px] placeholder:text-label-3"
      />

      {!editing && (
        <div className="mt-3 rounded-xl bg-fill px-3.5 py-2">
          <div className="flex min-h-10 items-center justify-between">
            <span className="flex items-center gap-2 text-[16px]">
              <Icon name="repeat" size={18} className="text-label-2" />
              Répéter
            </span>
            <Toggle checked={repeat} onChange={setRepeat} label="Répéter cette opération" />
          </div>
          {repeat && (
            <div className="pt-2 pb-1">
              <Segmented
                label="Fréquence"
                value={frequency}
                onChange={setFrequency}
                options={[
                  { value: 'weekly', label: 'Semaine' },
                  { value: 'monthly', label: 'Mois' },
                  { value: 'yearly', label: 'Année' },
                ]}
              />
              <p className="mt-2 text-[13px] text-label-2">
                Première échéance le {formatShortDate(date, today)}, puis générée automatiquement.
              </p>
            </div>
          )}
        </div>
      )}
      {editing?.recurringId && (
        <p className="mt-3 text-[13px] text-label-2">
          <Icon name="repeat" size={14} className="mr-1 inline" />
          Générée par une opération récurrente. La modifier ici ne change que cette échéance.
        </p>
      )}
    </Sheet>
  );
}
