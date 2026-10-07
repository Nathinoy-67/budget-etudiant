import { Icon } from './Icon';
import { haptic } from '../lib/haptics';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'back'] as const;

/** Applique une touche à la saisie en cours ("12,5"), en limitant à 2 décimales et 7 chiffres. */
export function applyKey(current: string, key: string): string {
  if (key === 'back') return current.slice(0, -1);
  if (key === ',') {
    if (current.includes(',')) return current;
    return current === '' ? '0,' : current + ',';
  }
  const [int, dec] = current.split(',');
  if (dec !== undefined) {
    if (dec.length >= 2) return current;
    return current + key;
  }
  if (int.replace(/^0+/, '').length >= 7) return current;
  if (current === '0') return key;
  return current + key;
}

/** Pavé numérique intégré (évite le clavier iOS qui masque la moitié de l'écran). */
export function Keypad({ value, onChange, compact }: { value: string; onChange: (v: string) => void; compact?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Pavé numérique">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          aria-label={k === 'back' ? 'Effacer' : k === ',' ? 'Virgule' : k}
          onClick={() => {
            haptic('light');
            onChange(applyKey(value, k));
          }}
          onContextMenu={(e) => {
            if (k === 'back') {
              e.preventDefault();
              onChange('');
            }
          }}
          className={`pressable flex items-center justify-center rounded-xl bg-fill text-[26px] font-medium tabular active:bg-fill-2 ${
            compact ? 'h-12' : 'h-[54px]'
          }`}
        >
          {k === 'back' ? <Icon name="backspace" size={26} /> : k}
        </button>
      ))}
    </div>
  );
}
