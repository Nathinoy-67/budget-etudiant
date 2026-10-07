import type { AppData } from '../hooks/useData';
import type { Transaction } from '../types';
import { categoryBudgets, crossedLevel, spentByCategory } from '../lib/budget';
import { formatMoney } from '../lib/money';
import { haptic } from '../lib/haptics';
import { notify } from '../lib/notifications';
import { nextOccurrence } from '../lib/recurrence';
import { addDays, diffDays, inPeriod, nowTimeParis } from '../lib/dates';
import { toast } from '../stores/ui';
import { db } from '../db/db';

async function markNotified(keys: string[]) {
  const s = await db.settings.get('main');
  if (!s) return;
  const merged = [...new Set([...(s.notified ?? []), ...keys])].slice(-300);
  await db.settings.update('main', { notified: merged });
}

/** Après l'ajout ou la modification d'une dépense : alerte si un budget passe 80 % ou 100 %. */
export async function checkBudgetAfterChange(data: AppData, tx: Transaction, previous?: Transaction | null) {
  if (tx.type !== 'expense' || !tx.categoryId || !inPeriod(tx.date, data.period)) return;
  const cat = data.categoryById.get(tx.categoryId);
  if (!cat?.budget) return;
  const others = data.transactions.filter((t) => t.id !== tx.id && t.id !== previous?.id);
  const before = spentByCategory(previous ? [...others, previous] : others, data.period).get(cat.id) ?? 0;
  const after = spentByCategory([...others, tx], data.period).get(cat.id) ?? 0;
  const level = crossedLevel(before, after, cat.budget);
  if (!level) return;

  const msg =
    level === 'over'
      ? `Budget ${cat.emoji} ${cat.name} dépassé : ${formatMoney(after)} / ${formatMoney(cat.budget)}`
      : `${cat.emoji} ${cat.name} : 80 % du budget atteint (reste ${formatMoney(cat.budget - after)})`;
  haptic(level === 'over' ? 'error' : 'warning');
  setTimeout(() => toast(msg, { tone: level === 'over' ? 'error' : 'warning', duration: 4500 }), 400);
  const key = `budget:${cat.id}:${data.period.start}:${level}`;
  if (data.settings.notifications.budgetAlerts && !data.settings.notified.includes(key)) {
    await notify(level === 'over' ? 'Budget dépassé' : 'Attention au budget', msg, key);
    await markNotified([key]);
  }
}

/**
 * Vérifications à l'ouverture / au retour au premier plan :
 * budgets dépassés, renouvellements d'abonnements proches, rappel quotidien.
 * Chaque alerte n'est envoyée qu'une fois (clé mémorisée).
 */
export async function runForegroundChecks(data: AppData) {
  const { settings, today } = data;
  const prefs = settings.notifications;
  const sent = new Set(settings.notified ?? []);
  const newKeys: string[] = [];

  if (prefs.budgetAlerts) {
    for (const b of categoryBudgets(data.categories, data.transactions, data.period)) {
      if (b.level === 'ok') continue;
      const key = `budget:${b.category.id}:${data.period.start}:${b.level}`;
      if (sent.has(key)) continue;
      const msg =
        b.level === 'over'
          ? `${b.category.emoji} ${b.category.name} : ${formatMoney(b.spent)} dépensés pour un budget de ${formatMoney(b.budget)}.`
          : `${b.category.emoji} ${b.category.name} : ${Math.round(b.pct)} % du budget utilisé.`;
      if (await notify(b.level === 'over' ? 'Budget dépassé' : 'Attention au budget', msg, key)) newKeys.push(key);
    }
  }

  if (prefs.subscriptionReminders) {
    for (const r of data.recurrings) {
      if (!r.active || !r.isSubscription) continue;
      const next = nextOccurrence(r, today);
      if (!next) continue;
      const days = diffDays(today, next);
      if (days < 0 || days > r.remindDaysBefore) continue;
      const key = `sub:${r.id}:${next}`;
      if (sent.has(key)) continue;
      const when = days === 0 ? "aujourd'hui" : days === 1 ? 'demain' : `dans ${days} jours`;
      if (await notify(`Renouvellement ${when}`, `${r.emoji ?? '🔁'} ${r.name} : ${formatMoney(r.amount)} prélevés ${when}.`, key))
        newKeys.push(key);
    }
  }

  if (prefs.dailyReminder && nowTimeParis() >= prefs.reminderTime) {
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
