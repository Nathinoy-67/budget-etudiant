import { useState } from 'react';
import { useData } from '../../hooks/useData';
import { Icon } from '../../components/Icon';
import { exportJSON } from './backupActions';

const SNOOZE_KEY = 'be-backup-snooze';
const DAY = 86_400_000;

/**
 * Rappel de sauvegarde : iOS peut effacer les données d'une PWA peu utilisée,
 * une copie régulière dans Fichiers / iCloud évite de tout perdre.
 */
export function BackupBanner() {
  const { settings, transactions } = useData();
  const [snoozedUntil, setSnoozedUntil] = useState(() => {
    try {
      return Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
    } catch {
      return 0;
    }
  });

  const now = Date.now();
  const last = settings.lastBackupAt ?? settings.createdAt;
  const due = now - last > settings.backupReminderDays * DAY;
  const enoughData = transactions.length >= 5;
  if (settings.demoMode || !due || !enoughData || snoozedUntil > now || settings.backupReminderDays <= 0) return null;

  const days = Math.floor((now - last) / DAY);
  const snooze = () => {
    const until = now + 3 * DAY;
    try {
      localStorage.setItem(SNOOZE_KEY, String(until));
    } catch {
      /* ignore */
    }
    setSnoozedUntil(until);
  };

  return (
    <div className="mb-3 flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-card" role="status">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-fill text-label-2" aria-hidden="true">
        <Icon name="database" size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium">{settings.lastBackupAt ? `Dernière sauvegarde il y a ${days} jours` : 'Sauvegarde tes données'}</p>
        <p className="text-[12px] text-label-2">Une copie dans Fichiers évite toute perte.</p>
      </div>
      <button onClick={snooze} className="min-h-10 px-1 text-[14px] text-label-2" aria-label="Me le rappeler plus tard">
        Plus tard
      </button>
      <button onClick={() => void exportJSON()} className="min-h-10 px-1 text-[14px] font-semibold text-accent">
        Sauvegarder
      </button>
    </div>
  );
}
