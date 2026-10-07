import { useEffect, useState } from 'react';
import { Screen } from '../../components/Screen';
import { Button, EmptyState, Field, IconButton, List, Money, Section, Select, TextInput } from '../../components/ui';
import { Sheet } from '../../components/Sheet';
import { CategoryGrid } from '../../components/pickers';
import { useData } from '../../hooks/useData';
import { toast } from '../../stores/ui';
import { centsToInput, parseAmount } from '../../lib/money';
import { deleteQuickAdd, saveQuickAdd } from '../../db/actions';
import type { ID, QuickAdd } from '../../types';

export function QuickAddsScreen() {
  const { quickAdds, categoryById } = useData();
  const [editing, setEditing] = useState<Partial<QuickAdd> | null>(null);

  return (
    <Screen title="Ajout express" back actions={<IconButton icon="plus" label="Nouveau raccourci" onClick={() => setEditing({})} />}>
      <p className="mb-4 px-1 text-[15px] text-label-2">
        Tes dépenses fréquentes, ajoutées en <strong>un seul tap</strong> depuis l'accueil (avec possibilité d'annuler).
      </p>
      {quickAdds.length === 0 ? (
        <EmptyState icon="zap" title="Aucun raccourci" action={<Button onClick={() => setEditing({})}>Créer un raccourci</Button>} />
      ) : (
        <Section>
          <List>
            {quickAdds.map((q) => (
              <button key={q.id} onClick={() => setEditing(q)} className="relative flex min-h-[56px] w-full items-center gap-3 px-4 text-left active:bg-fill">
                <span className="text-[22px]">{q.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px]">{q.label}</span>
                  <span className="block truncate text-[13px] text-label-2">{q.categoryId ? categoryById.get(q.categoryId)?.name : 'Sans catégorie'}</span>
                </span>
                <Money cents={q.amount} className="font-semibold" />
              </button>
            ))}
          </List>
        </Section>
      )}
      <QuickAddSheet item={editing} onClose={() => setEditing(null)} />
    </Screen>
  );
}

function QuickAddSheet({ item, onClose }: { item: Partial<QuickAdd> | null; onClose: () => void }) {
  const { categories, accounts } = useData();
  const [label, setLabel] = useState('');
  const [emoji, setEmoji] = useState('☕');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<ID | null>(null);
  const [accountId, setAccountId] = useState<ID | ''>('');

  useEffect(() => {
    if (!item) return;
    setLabel(item.label ?? '');
    setEmoji(item.emoji ?? '☕');
    setAmount(item.amount ? centsToInput(item.amount) : '');
    setCategoryId(item.categoryId ?? categories.find((c) => c.kind === 'expense' && !c.archived)?.id ?? null);
    setAccountId(item.accountId ?? '');
  }, [item]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const cents = parseAmount(amount);
    if (!label.trim()) return toast('Donne un nom', { tone: 'warning' });
    if (!cents || cents <= 0) return toast('Montant invalide', { tone: 'warning' });
    await saveQuickAdd({ id: item?.id, label: label.trim(), emoji: emoji || '⚡', amount: cents, categoryId, accountId: accountId || null });
    toast('Raccourci enregistré', { tone: 'success' });
    onClose();
  };

  return (
    <Sheet
      open={!!item}
      onClose={onClose}
      title={item?.id ? 'Modifier le raccourci' : 'Nouveau raccourci'}
      right={
        <button className="min-h-11 px-2 text-[17px] font-semibold text-accent" onClick={save}>
          OK
        </button>
      }
    >
      <div className="grid grid-cols-[72px_1fr] gap-2">
        <Field label="Emoji">{(id) => <TextInput id={id} value={emoji} onChange={(e) => setEmoji([...new Intl.Segmenter().segment(e.target.value)].pop()?.segment ?? '')} className="text-center" />}</Field>
        <Field label="Nom">{(id) => <TextInput id={id} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. Café, Kebab" maxLength={24} />}</Field>
      </div>
      <Field label="Montant (€)">{(id) => <TextInput id={id} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1,50" />}</Field>
      <Field label="Compte">
        {(id) => (
          <Select id={id} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Compte par défaut</option>
            {accounts
              .filter((a) => !a.archived)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.emoji} {a.name}
                </option>
              ))}
          </Select>
        )}
      </Field>
      <p className="mb-1.5 px-1 text-[13px] font-medium text-label-2">Catégorie</p>
      <CategoryGrid categories={categories.filter((c) => c.kind === 'expense' && !c.archived)} value={categoryId} onChange={setCategoryId} />
      {item?.id && (
        <Button
          variant="destructive"
          icon="trash"
          block
          className="mt-5"
          onClick={async () => {
            await deleteQuickAdd(item.id!);
            toast('Raccourci supprimé');
            onClose();
          }}
        >
          Supprimer
        </Button>
      )}
    </Sheet>
  );
}
