import { exitDemoMode, startDemoMode } from '../../db/demo';
import { confirmAction } from '../../components/Overlays';
import { haptic } from '../../lib/haptics';
import { toast } from '../../stores/ui';

/** Affiche les données exemple ; les vraies données sont mises de côté, rien n'est perdu. */
export async function tryDemoData(alreadyDemo: boolean): Promise<void> {
  if (!alreadyDemo) {
    const ok = await confirmAction({
      title: 'Essayer les données exemple ?',
      message:
        "Tes vraies données sont mises de côté sur ton téléphone, puis remises exactement comme avant quand tu touches « Revenir à mes données ». Les paiements Apple Pay faits pendant l'essai arriveront à ton retour.",
      confirmLabel: 'Essayer',
    });
    if (!ok) return;
  }
  toast('Chargement des données exemple…');
  await startDemoMode();
  toast('Données exemple chargées', { tone: 'success' });
}

/** Quitte les données exemple et remet les vraies données. */
export async function backToRealData(): Promise<void> {
  const ok = await exitDemoMode();
  if (!ok) {
    toast('Aucune donnée mise de côté', { tone: 'warning' });
    return;
  }
  haptic('success');
  toast('Tes vraies données sont revenues', { tone: 'success' });
}
