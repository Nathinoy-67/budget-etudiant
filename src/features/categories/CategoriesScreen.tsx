import { useEffect, useState } from 'react';
import { Screen } from '../../components/Screen';
import { Button, Field, IconButton, List, Section, Segmented, Select, TextInput } from '../../components/ui';
import { Sheet } from '../../components/Sheet';
import { ColorPicker, EmojiPicker } from '../../components/pickers';
import { confirmAction } from '../../components/Overlays';
import { useData } from '../../hooks/useData';
import { toast } from '../../stores/ui';
import { centsToInput, formatMoney, parseAmount } from '../../lib/money';
import { removeCategory, reorderCategories, saveCategory } from '../../db/actions';
import { INCOME_SOURCE_LABEL } from '../../db/defaults';
import type { Category, CategoryKind, IncomeSource } from '../../types';

export function CategoriesScreen() {
  const { categories, transactions } = useData();
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [editing, setEditing] = useState<Partial<Category> | null>(null);
  const list = categories.filter((c) => c.kind === kind && !c.archived);
  const archived = categories.filter((c) => c.kind === kind && c.archived);
  const counts = new Map<string, number>();
  for (const t of transactions) if (t.categoryId) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);

  const move = (index: number, dir: -1 | 1) => {
    const ids = list.map((c) => c.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    void reorderCategories(ids);
  };

  return (
    <Screen title="Catégories" back actions={<IconButton icon="plus" label="Nouvelle catégorie" onClick={() => setEditing({ kind })} />}>
      <Segmented
        label="Type de catégorie"
        className="mb-4"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'expense', label: 'Dépenses' },
          { value: 'income', label: 'Revenus' },
        ]}
      />
      <Section footer="L'ordre est celui de la grille de saisie rapide. Utilise les flèches pour mettre tes catégories favorites en premier.">
        <List>
          {list.map((c, i) => (
            <div key={c.id} className="relative flex min-h-[56px] items-center gap-2 pr-1 pl-4">
              <button onClick={() => setEditing(c)} className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 text-left">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[18px]" style={{ background: `${c.color}2e` }}>
                  {c.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px]">{c.name}</span>
                  <span className="block truncate text-[13px] text-label-2">
                    {counts.get(c.id) ?? 0} opération(s)
                    {c.budget ? ` · budget ${formatMoney(c.budget, { compact: true })}` : ''}
                    {c.kind === 'income' && c.incomeSource ? ` · ${INCOME_SOURCE_LABEL[c.incomeSource]}` : ''}
                  </span>
                </span>
              </button>
              <IconButton icon="arrowUp" label={`Monter ${c.name}`} size={18} className="text-label-3" disabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton icon="arrowDown" label={`Descendre ${c.name}`} size={18} className="text-label-3" disabled={i === list.length - 1} onClick={() => move(i, 1)} />
            </div>
          ))}
        </List>
      </Section>
      {archived.length > 0 && (
        <Section title="Archivées">
          <List>
            {archived.map((c) => (
              <button key={c.id} onClick={() => setEditing(c)} className="relative flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-label-2 active:bg-fill">
                <span className="text-[18px]">{c.emoji}</span>
                <span className="flex-1 truncate text-[16px]">{c.name}</span>
              </button>
            ))}
          </List>
        </Section>
      )}
      <CategorySheet category={editing} onClose={() => setEditing(null)} />
    </Screen>
  );
}

function CategorySheet({ category, onClose }: { category: Partial<Category> | null; onClose: () => void }) {
  const isEdit = !!category?.id;
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('📦');
  const [color, setColor] = useState('#5B5BD6');
  const [budget, setBudget] = useState('');
  const [source, setSource] = useState<IncomeSource>('autre');
  const kind = category?.kind ?? 'expense';

  useEffect(() => {
    if (!category) return;
    setName(category.name ?? '');
    setEmoji(category.emoji ?? (kind === 'income' ? '💶' : '📦'));
    setColor(category.color ?? '#5B5BD6');
    setBudget(category.budget ? centsToInput(category.budget) : '');
    setSource(category.incomeSource ?? 'autre');
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!name.trim()) return toast('Donne un nom', { tone: 'warning' });
    const b = budget.trim() ? parseAmount(budget) : null;
    if (budget.trim() && (b == null || b < 0)) return toast('Budget invalide', { tone: 'warning' });
    await saveCategory({
      id: category?.id,
      name: name.trim(),
      emoji,
      color,
      kind,
      budget: kind === 'expense' ? b : null,
      incomeSource: kind === 'income' ? source : undefined,
      archived: category?.archived ?? false,
    });
    toast(isEdit ? 'Catégorie modifiée' : 'Catégorie créée', { tone: 'success' });
    onClose();
  };

  return (
    <Sheet
      open={!!category}
      onClose={onClose}
      title={isEdit ? 'Modifier' : 'Nouvelle catégorie'}
      right={
        <button className="min-h-11 px-2 text-[17px] font-semibold text-accent" onClick={save}>
          OK
        </button>
      }
    >
      <div className="mb-4 flex justify-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full text-[32px]" style={{ background: `${color}2e` }}>
          {emoji}
        </span>
      </div>
      <Field label="Nom">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Café, Soirées" maxLength={30} />}</Field>
      {kind === 'expense' ? (
        <Field label="Budget mensuel (€, facultatif)">{(id) => <TextInput id={id} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Aucun plafond" />}</Field>
      ) : (
        <Field label="Type de revenu (pour le suivi séparé)">
          {(id) => (
            <Select id={id} value={source} onChange={(e) => setSource(e.target.value as IncomeSource)}>
              {Object.entries(INCOME_SOURCE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <p className="mb-1.5 px-1 text-[13px] font-medium text-label-2">Couleur</p>
      <div className="mb-4">
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <p className="mb-1.5 px-1 text-[13px] font-medium text-label-2">Emoji</p>
      <EmojiPicker value={emoji} onChange={setEmoji} />
      {isEdit && (
        <div className="mt-5 space-y-2">
          {category?.archived && (
            <Button variant="secondary" block onClick={() => void saveCategory({ ...(category as Category), archived: false }).then(onClose)}>
              Réactiver
            </Button>
          )}
          <Button
            variant="destructive"
            icon="trash"
            block
            onClick={async () => {
              const ok = await confirmAction({
                title: `Supprimer « ${category?.name} » ?`,
                message: 'Si elle est utilisée, elle sera archivée pour garder ton historique intact.',
                confirmLabel: 'Supprimer',
                destructive: true,
              });
              if (!ok || !category?.id) return;
              const res = await removeCategory(category.id);
              toast(res === 'archived' ? 'Catégorie archivée' : 'Catégorie supprimée');
              onClose();
            }}
          >
            Supprimer
          </Button>
        </div>
      )}
    </Sheet>
  );
}
