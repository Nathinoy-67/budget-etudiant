import type { ISODate } from '../types';

/**
 * Génération de fichiers calendrier (.ics). Sur iPhone, ouvrir le fichier propose
 * « Ajouter au calendrier » : c'est le seul moyen fiable d'avoir des rappels programmés
 * sans serveur, une PWA ne pouvant pas planifier de notification locale.
 */

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function stamp(now = new Date()): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export interface IcsEvent {
  uid: string;
  title: string;
  description?: string;
  date: ISODate;
  /** HH:MM ; sans heure, l'événement dure toute la journée. */
  time?: string;
  /** Règle de répétition iCalendar, ex. "FREQ=DAILY". */
  rrule?: string;
  /** Alarme N minutes avant (0 = à l'heure). */
  alarmMinutesBefore?: number;
}

export function buildIcs(events: IcsEvent[], now = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Budget Etudiant//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    const d = e.date.replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@budget-etudiant`, `DTSTAMP:${stamp(now)}`, `SUMMARY:${esc(e.title)}`);
    if (e.time) {
      const t = e.time.replace(':', '') + '00';
      lines.push(`DTSTART;TZID=Europe/Paris:${d}T${t}`, 'DURATION:PT5M');
    } else {
      lines.push(`DTSTART;VALUE=DATE:${d}`);
    }
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.rrule) lines.push(`RRULE:${e.rrule}`);
    if (e.alarmMinutesBefore != null) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${esc(e.title)}`,
        `TRIGGER:-PT${Math.max(0, Math.round(e.alarmMinutesBefore))}M`,
        'END:VALARM',
      );
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
