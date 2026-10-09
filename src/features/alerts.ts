import type { AppData } from '../hooks/useData';
import { notify } from '../lib/notifications';
import { addDays, nowTimeParis } from '../lib/dates';
import { db } from '../db/db';

/**
 * Vérification à l'ouverture / au retour au premier plan : rappel quotidien de noter ses dépenses.
 * (Les alertes de budget et de renouvellement d'abonnement ont été retirées.)
 * Chaque rappel n'est envoyé qu'une fois par jour (clé mémorisée).
 */
export async function runForegroundChecks(data: AppData) {
  const { settings, today } = data;
  const prefs = settings.notifications;
  const sent = new Set(settings.notified ?? []);
  const newKeys: string[] = [];

  if (prefs.dailyReminder && !settings.demoMode && nowTimeParis() >= prefs.reminderTime) {
    const key = `daily:${today}`;
    const hasToday = data.transactions.some((t) => t.date === today && !t.recurringId);
    if (!sent.has(key) && !hasToday) {
      if (await notify('Tes dépenses du jour', "Tu n'as encore rien noté aujourd'hui. 30 secondes suffisent !", key))
        newKeys.push(key);
    }
  }

  // nettoyage des clés de plus de 90 jours
  const cutoff = addDays(today, -90);
  if (newKeys.length || (settings.notified ?? []).some((k) => (k.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? today) < cutoff)) {
    const kept = (settings.notified ?? []).filter((k) => (k.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? today) >= cutoff);
    await db.settings.update('main', { notified: [...new Set([...kept, ...newKeys])].slice(-300) });
  }
}
