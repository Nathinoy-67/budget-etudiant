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
  if (!due || !enoughData || snoozedUntil > now || settings.backupReminderDays <= 0) return null;

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
    <div className="mb-4 rounded-2xl bg-warning-soft p-4" role="alert">
      <div className="flex gap-3">
        <Icon name="database" size={22} className="mt-0.5 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">
            {settings.lastBackupAt ? `Dernière sauvegarde il y a ${days} jours` : 'Pense à sauvegarder tes données'}
          </p>
          <p className="mt-0.5 text-[14px] text-label-2">
            iOS peut effacer les données des applis web. Garde une copie dans Fichiers ou iCloud Drive.
          </p>
          <div className="mt-2 flex gap-2">
            <button onClick={() => void exportJSON()} className="pressable min-h-11 rounded-xl bg-warning px-4 text-[15px] font-semibold text-white dark:text-black">
              Sauvegarder
            </button>
            <button onClick={snooze} className="min-h-11 px-3 text-[15px] font-medium text-label-2">
              Plus tard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
