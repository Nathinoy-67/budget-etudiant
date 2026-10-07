import { useEffect, useMemo, useState } from 'react';
import { Screen } from '../../components/Screen';
import { Button, Card, EmptyState, Field, IconButton, List, Money, Row, Section, Select, TextInput } from '../../components/ui';
import { Sheet } from '../../components/Sheet';
import { ColorPicker, EmojiPicker } from '../../components/pickers';
import { confirmAction } from '../../components/Overlays';
import { useData } from '../../hooks/useData';
import { useNav } from '../../stores/nav';
import { toast, useTxSheet } from '../../stores/ui';
import { accountBalances } from '../../lib/budget';
import { centsToInput, parseAmount } from '../../lib/money';
import { formatShortDate, relativeDayLabel } from '../../lib/dates';
import { removeAccount, saveAccount, updateSettings } from '../../db/actions';
import { ACCOUNT_TYPE_LABEL } from '../../db/defaults';
import { TxRow } from '../transactions/TxRow';
import type { Account, AccountType } from '../../types';

export function AccountsScreen() {
  const { accounts, transactions, today } = useData();
  const push = useNav((s) => s.push);
  const openNew = useTxSheet((s) => s.openNew);
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);
  const balances = useMemo(() => accountBalances(accounts, transactions, today), [accounts, transactions, today]);
  const total = active.reduce((s, a) => s + (balances.get(a.id) ?? 0), 0);
  const savings = active.filter((a) => a.type === 'epargne' || a.type === 'livret').reduce((s, a) => s + (balances.get(a.id) ?? 0), 0);

  return (
    <Screen title="Comptes" back actions={<IconButton icon="plus" label="Nouveau compte" onClick={() => setEditing('new')} />}>
      <Card className="mb-4 p-4">
        <p className="text-[13px] font-medium text-label-2">Patrimoine total</p>
        <Money cents={total} className="text-[32px] font-bold tracking-tight" colored={total < 0} />
        <div className="mt-2 flex gap-4 text-[14px] text-label-2">
          <span>
            Disponible : <Money cents={total - savings} className="font-semibold text-label" />
          </span>
          <span>
            Épargne : <Money cents={savings} className="font-semibold text-label" />
          </span>
        </div>
      </Card>

      <Button variant="tinted" icon="swap" block className="mb-5" onClick={() => openNew({ type: 'transfer' })} disabled={active.length < 2}>
        Faire un virement entre comptes
      </Button>

      {active.length === 0 ? (
        <EmptyState icon="wallet" title="Aucun compte" action={<Button onClick={() => setEditing('new')}>Créer un compte</Button>} />
      ) : (
        <Section title="Mes comptes">
          <List>
            {active.map((a) => (
              <Row
                key={a.id}
                emoji={a.emoji}
                iconBg={`${a.color}33`}
                title={a.name}
                subtitle={ACCOUNT_TYPE_LABEL[a.type]}
                value={<Money cents={balances.get(a.id) ?? 0} colored={(balances.get(a.id) ?? 0) < 0} className="font-semibold text-label" />}
                chevron
                onClick={() => push('account', { id: a.id })}
              />
            ))}
          </List>
        </Section>
      )}
      {archived.length > 0 && (
        <Section title="Archivés" footer="Les comptes archivés gardent leur historique mais n'apparaissent plus dans la saisie.">
          <List>
            {archived.map((a) => (
              <Row key={a.id} emoji={a.emoji} title={a.name} value={<Money cents={balances.get(a.id) ?? 0} />} onClick={() => setEditing(a)} chevron />
            ))}
          </List>
        </Section>
      )}
      <AccountSheet account={editing} onClose={() => setEditing(null)} />
    </Screen>
  );
}

export function AccountDetailScreen({ params }: { params?: Record<string, string> }) {
  const { accounts, transactions, today, settings } = useData();
  const pop = useNav((s) => s.pop);
  const [editing, setEditing] = useState(false);
  const account = accounts.find((a) => a.id === params?.id);
  const balance = useMemo(() => (account ? (accountBalances([account], transactions, today).get(account.id) ?? 0) : 0), [account, transactions, today]);
  const txs = useMemo(() => transactions.filter((t) => t.accountId === account?.id || t.toAccountId === account?.id), [transactions, account?.id]);

  useEffect(() => {
    if (!account) pop();
  }, [account, pop]);
  if (!account) return null;

  const isDefault = settings.defaultAccountId === account.id;

  return (
    <Screen title={account.name} back actions={<IconButton icon="edit" label="Modifier le compte" onClick={() => setEditing(true)} />} subtitle={ACCOUNT_TYPE_LABEL[account.type]}>
      <Card className="mb-4 p-4">
        <p className="text-[13px] font-medium text-label-2">Solde actuel</p>
        <Money cents={balance} className="text-[32px] font-bold tracking-tight" colored={balance < 0} />
        <p className="mt-1 text-[13px] text-label-2">
          Solde initial <Money cents={account.initialBalance} /> · {txs.length} opération(s)
        </p>
      </Card>
      {!isDefault && !account.archived && (
        <Button variant="secondary" block className="mb-4" onClick={() => void updateSettings({ defaultAccountId: account.id }).then(() => toast('Compte par défaut modifié'))}>
          Utiliser par défaut pour la saisie
        </Button>
      )}
      {txs.length === 0 ? (
        <EmptyState icon="list" title="Aucune opération sur ce compte" />
      ) : (
        <Section title="Historique">
          <List>
            {txs.slice(0, 200).map((t) => (
              <TxRow key={t.id} tx={t} showDate={t.date >= today ? relativeDayLabel(t.date, today) : formatShortDate(t.date, today)} />
            ))}
          </List>
        </Section>
      )}
      <AccountSheet account={editing ? account : null} onClose={() => setEditing(false)} />
    </Screen>
  );
}

function AccountSheet({ account, onClose }: { account: Account | 'new' | null; onClose: () => void }) {
  const isNew = account === 'new';
  const a = account && account !== 'new' ? account : null;
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('courant');
  const [emoji, setEmoji] = useState('💳');
  const [color, setColor] = useState('#5B5BD6');
  const [initial, setInitial] = useState('');

  useEffect(() => {
    if (!account) return;
    setName(a?.name ?? '');
    setType(a?.type ?? 'courant');
    setEmoji(a?.emoji ?? '💳');
    setColor(a?.color ?? '#5B5BD6');
    setInitial(a ? centsToInput(a.initialBalance) : '');
  }, [account]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const cents = initial.trim() ? parseAmount(initial) : 0;
    if (!name.trim()) return toast('Donne un nom au compte', { tone: 'warning' });
    if (cents == null) return toast('Solde initial invalide', { tone: 'warning' });
    await saveAccount({ id: a?.id, name: name.trim(), type, emoji, color, initialBalance: cents, archived: a?.archived ?? false });
    toast(isNew ? 'Compte créé' : 'Compte modifié', { tone: 'success' });
    onClose();
  };

  const remove = async () => {
    if (!a) return;
    const ok = await confirmAction({
      title: `Supprimer « ${a.name} » ?`,
      message: "S'il contient des opérations, il sera archivé pour garder l'historique.",
      confirmLabel: 'Supprimer',
      destructive: true,
    });
    if (!ok) return;
    const res = await removeAccount(a.id);
    toast(res === 'archived' ? 'Compte archivé (il contient des opérations)' : 'Compte supprimé');
    onClose();
  };

  return (
    <Sheet
      open={!!account}
      onClose={onClose}
      title={isNew ? 'Nouveau compte' : 'Modifier le compte'}
      right={
        <button className="min-h-11 px-2 text-[17px] font-semibold text-accent" onClick={save}>
          OK
        </button>
      }
    >
      <Field label="Nom">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Compte courant, Livret A" maxLength={40} />}</Field>
      <Field label="Type">
        {(id) => (
          <Select id={id} value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Solde initial (€)" hint="Le solde du compte avant ta première opération dans l'appli. Peut être négatif.">
        {(id) => <TextInput id={id} inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} placeholder="0" />}
      </Field>
      <p className="mb-1.5 px-1 text-[13px] font-medium text-label-2">Couleur</p>
      <div className="mb-4">
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <p className="mb-1.5 px-1 text-[13px] font-medium text-label-2">Icône</p>
      <EmojiPicker value={emoji} onChange={setEmoji} />
      {a && (
        <div className="mt-5 space-y-2">
          {a.archived && (
            <Button variant="secondary" block onClick={() => void saveAccount({ ...a, archived: false }).then(onClose)}>
              Désarchiver
            </Button>
          )}
          <Button variant="destructive" icon="trash" block onClick={remove}>
            Supprimer le compte
          </Button>
        </div>
      )}
    </Sheet>
  );
}
