import { AmountSheet } from '../../components/AmountSheet';
import { updateSettings } from '../../db/actions';
import { formatMoney } from '../../lib/money';
import { toast } from '../../stores/ui';

/** Réglage de la somme minimale à garder sur le compte à la fin du mois. */
export function KeepAtEndSheet({ open, onClose, current }: { open: boolean; onClose: () => void; current: number }) {
  return (
    <AmountSheet
      open={open}
      onClose={onClose}
      title="À garder en fin de mois"
      initial={current || null}
      allowZero
      onSave={async (cents) => {
        await updateSettings({ keepAtEnd: cents });
        toast(cents ? `Il te restera au moins ${formatMoney(cents)} en fin de mois` : 'Plus de somme à garder', { tone: 'success' });
      }}
      onClear={current ? async () => void (await updateSettings({ keepAtEnd: 0 })) : undefined}
      clearLabel="Aucune"
      saveLabel="Enregistrer"
    >
      <p className="px-2 text-center text-[14px] text-label-2">
        Cette somme est retirée de ton reste à vivre : ce que l'appli t'affiche à dépenser te garantit de finir le mois avec au moins ce montant.
      </p>
    </AmountSheet>
  );
}
