import { useRef } from 'react';
import { motion, useAnimation, type PanInfo } from 'motion/react';
import type { Transaction } from '../../types';
import { useData } from '../../hooks/useData';
import { useTxSheet, toast } from '../../stores/ui';
import { Money, Tile } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { deleteTransaction, restoreTransactions } from '../../db/actions';
import { haptic } from '../../lib/haptics';

/** Ligne de transaction : toucher pour modifier, glisser vers la gauche pour supprimer. */
export function TxRow({ tx, showDate }: { tx: Transaction; showDate?: string }) {
  const { categoryById, accountById, accounts } = useData();
  const openEdit = useTxSheet((s) => s.openEdit);
  const controls = useAnimation();
  const dragged = useRef(false);
  const cat = tx.categoryId ? categoryById.get(tx.categoryId) : undefined;
  const acc = accountById.get(tx.accountId);
  const to = tx.toAccountId ? accountById.get(tx.toAccountId) : undefined;

  const title =
    tx.type === 'transfer' ? `${acc?.name ?? '?'} → ${to?.name ?? '?'}` : tx.note || cat?.name || (tx.type === 'income' ? 'Revenu' : 'Dépense');
  const subtitleParts = [
    tx.type !== 'transfer' && tx.note ? cat?.name : tx.type === 'transfer' ? tx.note || 'Virement' : null,
    accounts.filter((a) => !a.archived).length > 1 && tx.type !== 'transfer' ? acc?.name : null,
    tx.source === 'applepay' ? 'Apple Pay' : null,
    showDate,
  ].filter(Boolean);

  const remove = async () => {
    haptic('medium');
    const removed = await deleteTransaction(tx.id);
    if (removed) toast('Opération supprimée', { action: { label: 'Annuler', onClick: () => void restoreTransactions([removed]) } });
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    setTimeout(() => (dragged.current = false), 50);
    if (info.offset.x < -110 || info.velocity.x < -800) {
      void controls.start({ x: '-100%', transition: { duration: 0.2 } }).then(remove);
    } else {
      void controls.start({ x: 0 });
    }
  };

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-end bg-[#E5484D] pr-6 text-white" aria-hidden="true">
        <Icon name="trash" size={22} />
      </div>
      <motion.button
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.9, right: 0 }}
        onDragStart={() => (dragged.current = true)}
        onDragEnd={onDragEnd}
        animate={controls}
        onClick={() => !dragged.current && openEdit(tx)}
        className="relative flex min-h-[64px] w-full items-center gap-3 bg-card px-4 py-2 text-left transition-colors active:bg-[var(--card-pressed)]"
        aria-label={`${title}, ${tx.type === 'expense' ? 'dépense' : tx.type === 'income' ? 'revenu' : 'virement'}. Toucher pour modifier.`}
      >
        {tx.type === 'transfer' ? <Tile icon="swap" /> : <Tile emoji={cat?.emoji ?? '💸'} color={cat?.color} />}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 truncate text-[15px] font-semibold tracking-[-0.01em]">
            <span className="truncate">{title}</span>
            {tx.recurringId && <Icon name="repeat" size={13} strokeWidth={2.2} className="shrink-0 text-label-3" />}
          </span>
          {subtitleParts.length > 0 && <span className="block truncate text-[13px] text-label-2">{subtitleParts.join(' · ')}</span>}
        </span>
        <Money
          cents={tx.type === 'expense' ? -tx.amount : tx.amount}
          sign={tx.type === 'income'}
          className={`text-[15px] font-semibold ${tx.type === 'income' ? 'text-positive' : tx.type === 'transfer' ? 'text-label-2' : 'text-negative'}`}
        />
      </motion.button>
    </div>
  );
}
