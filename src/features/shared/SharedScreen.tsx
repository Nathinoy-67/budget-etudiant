import { useEffect, useMemo, useState } from 'react';
import { Screen } from '../../components/Screen';
import { Button, Card, EmptyState, Field, IconButton, List, Money, Section, Select, TextInput, Toggle } from '../../components/ui';
import { Sheet } from '../../components/Sheet';
import { confirmAction } from '../../components/Overlays';
import { useData } from '../../hooks/useData';
import { useNav } from '../../stores/nav';
import { toast } from '../../stores/ui';
import { equalSplits, memberBalances, minimalSettlements } from '../../lib/split';
import { centsToInput, formatMoney, parseAmount } from '../../lib/money';
import { formatShortDate, isValidISO } from '../../lib/dates';
import { haptic } from '../../lib/haptics';
import { addTransaction, deleteGroup, deleteSharedExpense, saveGroup, saveSharedExpense } from '../../db/actions';
import { uid } from '../../db/db';
import type { ID, Member, SharedExpense, SharedGroup } from '../../types';

export function SharedScreen() {
  const { groups, sharedExpenses } = useData();
  const push = useNav((s) => s.push);
  const [creating, setCreating] = useState(false);

  return (
    <Screen title="Partagé" back actions={<IconButton icon="plus" label="Nouveau groupe" onClick={() => setCreating(true)} />}>
      {groups.length === 0 ? (
        <EmptyState
          icon="users"
          title="Aucun groupe"
          text="Crée un groupe pour ta coloc ou un week-end entre amis : l'appli calcule qui doit combien à qui, avec le moins de remboursements possible."
          action={<Button onClick={() => setCreating(true)}>Créer un groupe</Button>}
        />
      ) : (
        <List>
          {groups.map((g) => {
            const me = g.members.find((m) => m.isMe);
            const bal = me ? (memberBalances(g.members, sharedExpenses.filter((e) => e.groupId === g.id)).get(me.id) ?? 0) : 0;
            return (
              <button key={g.id} onClick={() => push('group', { id: g.id })} className="relative flex min-h-[64px] w-full items-center gap-3 px-4 py-2 text-left active:bg-fill">
                <span className="text-[26px]">{g.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-medium">{g.name}</span>
                  <span className="block truncate text-[13px] text-label-2">{g.members.map((m) => m.name).join(', ')}</span>
                </span>
                <span className="text-right">
                  <Money cents={bal} colored sign className="block font-semibold" />
                  <span className="text-[12px] text-label-2">{bal > 0 ? 'on te doit' : bal < 0 ? 'tu dois' : 'à jour'}</span>
                </span>
              </button>
            );
          })}
        </List>
      )}
      <GroupSheet group={creating ? 'new' : null} onClose={() => setCreating(false)} onCreated={(id) => push('group', { id })} />
    </Screen>
  );
}

export function GroupDetailScreen({ params }: { params?: Record<string, string> }) {
  const { groups, sharedExpenses, today } = useData();
  const pop = useNav((s) => s.pop);
  const group = groups.find((g) => g.id === params?.id);
  const [editingGroup, setEditingGroup] = useState(false);
  const [expense, setExpense] = useState<SharedExpense | 'new' | null>(null);

  const expenses = useMemo(() => sharedExpenses.filter((e) => e.groupId === group?.id), [sharedExpenses, group?.id]);
  const balances = useMemo(() => (group ? memberBalances(group.members, expenses) : new Map<ID, number>()), [group, expenses]);
  const settlements = useMemo(() => minimalSettlements(balances), [balances]);

  useEffect(() => {
    if (!group) pop();
  }, [group, pop]);
  if (!group) return null;
  const name = (id: ID) => group.members.find((m) => m.id === id)?.name ?? '?';
  const total = expenses.filter((e) => e.kind === 'expense').reduce((s, e) => s + e.amount, 0);

  const settle = async (from: ID, to: ID, amount: number) => {
    const ok = await confirmAction({
      title: `${name(from)} a remboursé ${formatMoney(amount)} à ${name(to)} ?`,
      confirmLabel: 'Marquer comme remboursé',
    });
    if (!ok) return;
    await saveSharedExpense({
      groupId: group.id,
      kind: 'settlement',
      description: 'Remboursement',
      amount,
      paidBy: from,
      splits: [{ memberId: to, share: amount }],
      date: today,
    });
    haptic('success');
    toast('Remboursement enregistré', { tone: 'success' });
  };

  return (
    <Screen
      title={group.name}
      back
      subtitle={`${group.members.length} membres · ${formatMoney(total)} de dépenses`}
      actions={<IconButton icon="edit" label="Modifier le groupe" onClick={() => setEditingGroup(true)} />}
    >
      <Button block icon="plus" className="mb-5" onClick={() => setExpense('new')}>
        Ajouter une dépense
      </Button>

      <Section title="Soldes">
        <List>
          {group.members.map((m) => {
            const b = balances.get(m.id) ?? 0;
            return (
              <div key={m.id} className="relative flex min-h-[52px] items-center gap-3 px-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-[15px] font-semibold text-accent">
                  {m.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="flex-1 text-[16px]">{m.name}</span>
                <span className="text-right">
                  <Money cents={b} colored sign className="block font-semibold" />
                  <span className="text-[12px] text-label-2">{b > 0 ? 'à recevoir' : b < 0 ? 'à payer' : 'à jour'}</span>
                </span>
              </div>
            );
          })}
        </List>
      </Section>

      <Section title="Pour tout équilibrer" footer={settlements.length ? `${settlements.length} remboursement(s) suffisent.` : undefined}>
        {settlements.length === 0 ? (
          <Card className="p-4 text-center text-[15px] text-label-2">Tout le monde est à jour</Card>
        ) : (
          <List>
            {settlements.map((s) => (
              <div key={`${s.from}-${s.to}`} className="relative flex min-h-[56px] items-center gap-3 px-4 py-2">
                <span className="min-w-0 flex-1 text-[16px]">
                  <strong>{name(s.from)}</strong> → <strong>{name(s.to)}</strong>
                  <span className="block text-[15px] text-label-2 tabular">{formatMoney(s.amount)}</span>
                </span>
                <Button variant="tinted" className="min-h-10 px-3 text-[14px]" onClick={() => void settle(s.from, s.to, s.amount)}>
                  Remboursé
                </Button>
              </div>
            ))}
          </List>
        )}
      </Section>

      <Section title="Historique">
        {expenses.length === 0 ? (
          <Card className="p-4 text-center text-[15px] text-label-2">Aucune dépense dans ce groupe.</Card>
        ) : (
          <List>
            {expenses.map((e) => (
              <button key={e.id} onClick={() => setExpense(e)} className="relative flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left active:bg-fill">
                <span className="text-[20px]">{e.kind === 'settlement' ? '🤝' : '🧾'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px]">
                    {e.kind === 'settlement' ? `${name(e.paidBy)} → ${name(e.splits[0]?.memberId)}` : e.description}
                  </span>
                  <span className="block truncate text-[13px] text-label-2">
                    {formatShortDate(e.date, today)} · {e.kind === 'settlement' ? 'remboursement' : `payé par ${name(e.paidBy)}`}
                  </span>
                </span>
                <Money cents={e.amount} className="font-semibold" />
              </button>
            ))}
          </List>
        )}
      </Section>

      <ExpenseSheet group={group} expense={expense} onClose={() => setExpense(null)} />
      <GroupSheet group={editingGroup ? group : null} onClose={() => setEditingGroup(false)} expenses={expenses} />
    </Screen>
  );
}

function ExpenseSheet({ group, expense, onClose }: { group: SharedGroup; expense: SharedExpense | 'new' | null; onClose: () => void }) {
  const { today, categories, settings, accounts } = useData();
  const e = expense && expense !== 'new' ? expense : null;
  const me = group.members.find((m) => m.isMe);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [paidBy, setPaidBy] = useState<ID>('');
  const [among, setAmong] = useState<ID[]>([]);
  const [record, setRecord] = useState(false);
  const [categoryId, setCategoryId] = useState<ID>('');

  useEffect(() => {
    if (!expense) return;
    setDescription(e?.description ?? '');
    setAmount(e ? centsToInput(e.amount) : '');
    setDate(e?.date ?? today);
    setPaidBy(e?.paidBy ?? me?.id ?? group.members[0]?.id ?? '');
    setAmong(e && e.kind === 'expense' ? e.splits.map((s) => s.memberId) : group.members.map((m) => m.id));
    setRecord(false);
    setCategoryId(categories.find((c) => c.name === 'Courses')?.id ?? categories.find((c) => c.kind === 'expense')?.id ?? '');
  }, [expense]); // eslint-disable-line react-hooks/exhaustive-deps

  const cents = parseAmount(amount || '0') ?? 0;
  const shares = equalSplits(cents, among);
  const myShare = shares.find((s) => s.memberId === me?.id)?.share ?? 0;
  const isSettlement = e?.kind === 'settlement';

  const save = async () => {
    if (!isSettlement && !description.trim()) return toast('Ajoute une description', { tone: 'warning' });
    if (cents <= 0) return toast('Saisis un montant', { tone: 'warning' });
    if (!isSettlement && among.length === 0) return toast('Choisis au moins une personne', { tone: 'warning' });
    if (!isValidISO(date)) return;
    await saveSharedExpense({
      id: e?.id,
      groupId: group.id,
      kind: e?.kind ?? 'expense',
      description: isSettlement ? 'Remboursement' : description.trim(),
      amount: cents,
      paidBy,
      splits: isSettlement ? [{ memberId: e!.splits[0].memberId, share: cents }] : shares,
      date,
    });
    if (record && myShare > 0) {
      await addTransaction({
        type: 'expense',
        amount: myShare,
        date,
        categoryId: categoryId || null,
        accountId: settings.defaultAccountId ?? accounts[0].id,
        toAccountId: null,
        note: `${description.trim()} (${group.name})`,
        recurringId: null,
        occurrence: null,
      });
    }
    haptic('success');
    toast(e ? 'Modifié' : 'Dépense ajoutée au groupe', { tone: 'success' });
    onClose();
  };

  return (
    <Sheet
      open={!!expense}
      onClose={onClose}
      title={isSettlement ? 'Remboursement' : e ? 'Modifier la dépense' : 'Dépense partagée'}
      right={
        <button className="min-h-11 px-2 text-[17px] font-semibold text-accent" onClick={save}>
          OK
        </button>
      }
    >
      {!isSettlement && (
        <Field label="Description">{(id) => <TextInput id={id} value={description} onChange={(ev) => setDescription(ev.target.value)} placeholder="Ex. Courses, électricité…" maxLength={60} />}</Field>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Montant (€)">{(id) => <TextInput id={id} inputMode="decimal" value={amount} onChange={(ev) => setAmount(ev.target.value)} placeholder="0,00" />}</Field>
        <Field label="Date">{(id) => <TextInput id={id} type="date" value={date} onChange={(ev) => ev.target.value && setDate(ev.target.value)} />}</Field>
      </div>
      <Field label={isSettlement ? 'Rembourse de la part de' : 'Payé par'}>
        {(id) => (
          <Select id={id} value={paidBy} onChange={(ev) => setPaidBy(ev.target.value)}>
            {group.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {!isSettlement && (
        <>
          <p className="mb-1.5 px-1 text-[13px] font-medium text-label-2">Partagé entre (parts égales)</p>
          <div className="mb-4 overflow-hidden rounded-xl bg-fill">
            {group.members.map((m) => {
              const on = among.includes(m.id);
              const share = shares.find((s) => s.memberId === m.id)?.share ?? 0;
              return (
                <button
                  key={m.id}
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => setAmong(on ? among.filter((x) => x !== m.id) : [...among, m.id])}
                  className="flex min-h-12 w-full items-center gap-3 border-b border-separator px-3.5 text-left last:border-0"
                >
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${on ? 'border-accent bg-accent text-white' : 'border-label-3'}`}>
                    {on && '✓'}
                  </span>
                  <span className="flex-1 text-[16px]">{m.name}</span>
                  {on && <Money cents={share} className="text-[15px] text-label-2" />}
                </button>
              );
            })}
          </div>
          {!e && me && myShare > 0 && (
            <div className="mb-3 rounded-xl bg-fill px-3.5 py-2">
              <div className="flex min-h-11 items-center justify-between gap-3">
                <span className="text-[15px]">Ajouter ma part ({formatMoney(myShare)}) à mes dépenses</span>
                <Toggle checked={record} onChange={setRecord} label="Ajouter ma part à mes dépenses" />
              </div>
              {record && (
                <Select value={categoryId} onChange={(ev) => setCategoryId(ev.target.value)} aria-label="Catégorie">
                  {categories
                    .filter((c) => c.kind === 'expense' && !c.archived)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.emoji} {c.name}
                      </option>
                    ))}
                </Select>
              )}
            </div>
          )}
        </>
      )}

      {e && (
        <Button
          variant="destructive"
          icon="trash"
          block
          className="mt-2"
          onClick={async () => {
            if (await confirmAction({ title: 'Supprimer cette ligne ?', confirmLabel: 'Supprimer', destructive: true })) {
              await deleteSharedExpense(e.id);
              onClose();
            }
          }}
        >
          Supprimer
        </Button>
      )}
    </Sheet>
  );
}

function GroupSheet({
  group,
  onClose,
  onCreated,
  expenses = [],
}: {
  group: SharedGroup | 'new' | null;
  onClose: () => void;
  onCreated?: (id: ID) => void;
  expenses?: SharedExpense[];
}) {
  const g = group && group !== 'new' ? group : null;
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🏠');
  const [members, setMembers] = useState<Member[]>([]);
  const [newMember, setNewMember] = useState('');

  useEffect(() => {
    if (!group) return;
    setName(g?.name ?? '');
    setEmoji(g?.emoji ?? '🏠');
    setMembers(g?.members ?? [{ id: uid(), name: 'Moi', isMe: true }]);
    setNewMember('');
  }, [group]); // eslint-disable-line react-hooks/exhaustive-deps

  const used = new Set(expenses.flatMap((e) => [e.paidBy, ...e.splits.map((s) => s.memberId)]));
  const addMember = () => {
    const n = newMember.trim();
    if (!n) return;
    setMembers([...members, { id: uid(), name: n }]);
    setNewMember('');
  };

  const save = async () => {
    if (!name.trim()) return toast('Donne un nom au groupe', { tone: 'warning' });
    const finalMembers = newMember.trim() ? [...members, { id: uid(), name: newMember.trim() }] : members;
    if (finalMembers.length < 2) return toast('Ajoute au moins une autre personne', { tone: 'warning' });
    const id = await saveGroup({ id: g?.id, name: name.trim(), emoji, members: finalMembers });
    toast(g ? 'Groupe modifié' : 'Groupe créé', { tone: 'success' });
    onClose();
    if (!g) onCreated?.(id);
  };

  return (
    <Sheet
      open={!!group}
      onClose={onClose}
      title={g ? 'Modifier le groupe' : 'Nouveau groupe'}
      right={
        <button className="min-h-11 px-2 text-[17px] font-semibold text-accent" onClick={save}>
          OK
        </button>
      }
    >
      <div className="grid grid-cols-[1fr_72px] gap-2">
        <Field label="Nom">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Coloc, Week-end ski" maxLength={40} />}</Field>
        <Field label="Emoji">{(id) => <TextInput id={id} value={emoji} onChange={(e) => setEmoji([...new Intl.Segmenter().segment(e.target.value)].pop()?.segment ?? '')} className="text-center" />}</Field>
      </div>
      <p className="mb-1.5 px-1 text-[13px] font-medium text-label-2">Membres</p>
      <div className="mb-2 overflow-hidden rounded-xl bg-fill">
        {members.map((m) => (
          <div key={m.id} className="flex min-h-12 items-center gap-2 border-b border-separator px-3.5 last:border-0">
            <input
              value={m.name}
              onChange={(e) => setMembers(members.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)))}
              className="min-h-11 flex-1 bg-transparent text-[16px]"
              aria-label={`Nom de ${m.name}`}
            />
            {m.isMe && <span className="text-[13px] text-label-2">c'est moi</span>}
            {!m.isMe && !used.has(m.id) && (
              <IconButton icon="x" label={`Retirer ${m.name}`} size={18} className="text-label-3" onClick={() => setMembers(members.filter((x) => x.id !== m.id))} />
            )}
          </div>
        ))}
      </div>
      <div className="mb-4 flex gap-2">
        <TextInput
          value={newMember}
          onChange={(e) => setNewMember(e.target.value)}
          placeholder="Prénom d'un membre"
          aria-label="Nouveau membre"
          enterKeyHint="done"
          onKeyDown={(e) => e.key === 'Enter' && addMember()}
        />
        <Button variant="tinted" onClick={addMember} aria-label="Ajouter le membre" icon="plus" />
      </div>
      {g && (
        <Button
          variant="destructive"
          icon="trash"
          block
          onClick={async () => {
            if (await confirmAction({ title: `Supprimer « ${g.name} » ?`, message: 'Toutes les dépenses du groupe seront supprimées.', confirmLabel: 'Supprimer', destructive: true })) {
              await deleteGroup(g.id);
              onClose();
            }
          }}
        >
          Supprimer le groupe
        </Button>
      )}
    </Sheet>
  );
}
