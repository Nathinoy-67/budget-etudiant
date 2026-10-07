import { exportAll, importAll, updateSettings } from '../../db/actions';
import { db } from '../../db/db';
import { validateBackup } from '../../lib/backup';
import { transactionsToCSV } from '../../lib/csv';
import { todayISO } from '../../lib/dates';
import { datedFilename, readFileAsText, saveFile } from '../../lib/files';
import { toast } from '../../stores/ui';
import { confirmAction } from '../../components/Overlays';
import { haptic } from '../../lib/haptics';

export async function exportJSON(): Promise<void> {
  const backup = await exportAll();
  const res = await saveFile(JSON.stringify(backup, null, 1), datedFilename('budget-etudiant-sauvegarde', 'json', todayISO()), 'application/json');
  if (res === 'cancelled') return;
  await updateSettings({ lastBackupAt: Date.now() });
  haptic('success');
  toast(res === 'shared' ? 'Sauvegarde prête — choisis « Enregistrer dans Fichiers »' : 'Sauvegarde téléchargée', { tone: 'success' });
}

export async function exportCSV(): Promise<void> {
  const [transactions, categories, accounts] = await Promise.all([db.transactions.toArray(), db.categories.toArray(), db.accounts.toArray()]);
  if (!transactions.length) {
    toast('Aucune opération à exporter', { tone: 'warning' });
    return;
  }
  const res = await saveFile(transactionsToCSV(transactions, categories, accounts), datedFilename('budget-etudiant-operations', 'csv', todayISO()), 'text/csv');
  if (res !== 'cancelled') toast(`${transactions.length} opérations exportées`, { tone: 'success' });
}

/** Ouvre le sélecteur de fichier puis restaure la sauvegarde après confirmation. */
export function pickAndImportJSON(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const raw = JSON.parse(await readFileAsText(file));
      const res = validateBackup(raw);
      if (!res.ok) {
        toast(res.error, { tone: 'error', duration: 4000 });
        return;
      }
      const date = new Date(res.backup.exportedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      const ok = await confirmAction({
        title: 'Restaurer cette sauvegarde ?',
        message: `Sauvegarde du ${date} : ${res.counts.transactions} opérations, ${res.counts.accounts} comptes. Toutes les données actuelles seront remplacées.`,
        confirmLabel: 'Remplacer mes données',
        destructive: true,
      });
      if (!ok) return;
      await importAll(res.backup);
      haptic('success');
      toast('Sauvegarde restaurée', { tone: 'success' });
    } catch (e) {
      console.error(e);
      toast('Fichier illisible : est-ce bien une sauvegarde JSON ?', { tone: 'error', duration: 4000 });
    }
  };
  input.click();
}
