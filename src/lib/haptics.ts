/**
 * Retour haptique.
 * - Android / Chrome : navigator.vibrate.
 * - iOS (Safari ne supporte pas vibrate) : depuis iOS 18, basculer un <input type="checkbox" switch>
 *   déclenche un léger retour haptique natif. On simule ce basculement via un <label> invisible.
 */
let enabled = true;
let label: HTMLLabelElement | null = null;

export function setHapticsEnabled(v: boolean) {
  enabled = v;
}

function iosSwitch(): HTMLLabelElement {
  if (label) return label;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.id = 'haptic-switch';
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');
  label = document.createElement('label');
  label.htmlFor = 'haptic-switch';
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
  label.appendChild(input);
  document.body.appendChild(label);
  return label;
}

export type HapticKind = 'light' | 'medium' | 'success' | 'warning' | 'error';

export function haptic(kind: HapticKind = 'light') {
  if (!enabled || typeof window === 'undefined') return;
  try {
    if (typeof navigator.vibrate === 'function') {
      const pattern: Record<HapticKind, number | number[]> = {
        light: 8,
        medium: 15,
        success: [10, 40, 10],
        warning: [20, 60, 20],
        error: [30, 50, 30, 50, 30],
      };
      navigator.vibrate(pattern[kind]);
      return;
    }
    const l = iosSwitch();
    l.click();
    if (kind === 'success' || kind === 'warning' || kind === 'error') setTimeout(() => l.click(), 90);
  } catch {
    /* pas de retour haptique disponible */
  }
}
