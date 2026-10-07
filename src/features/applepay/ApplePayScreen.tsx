import type { ReactNode } from 'react';
import { Screen } from '../../components/Screen';
import { Badge, Button, Card, Section } from '../../components/ui';
import { useData } from '../../hooks/useData';
import { toast } from '../../stores/ui';
import { haptic } from '../../lib/haptics';
import { isStandalone } from '../../lib/notifications';

/** Adresse de l'appli (ex. https://nathinoy-67.github.io/budget-etudiant/). */
const appUrl = () => `${location.origin}${import.meta.env.BASE_URL}`;
const prefixUrl = () => `${appUrl()}?applepay=`;
const testUrl = () => `${appUrl()}?applepay=${encodeURIComponent('0,01 €|Test Apple Pay')}`;

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    haptic('success');
    toast(`${label} copié`, { tone: 'success' });
  } catch {
    toast('Copie impossible : sélectionne le texte à la main', { tone: 'warning' });
  }
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-separator py-3.5 last:border-0">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[14px] font-bold text-white">{n}</span>
      <div className="min-w-0 flex-1 text-[15px]">
        <p className="font-semibold">{title}</p>
        <div className="mt-1 space-y-1.5 text-label-2">{children}</div>
      </div>
    </div>
  );
}

/** Pastille qui imite un élément de l'interface Raccourcis. */
const Ui = ({ children }: { children: ReactNode }) => (
  <span className="rounded-md bg-fill px-1.5 py-0.5 font-medium whitespace-nowrap text-label">{children}</span>
);
const Var = ({ children }: { children: ReactNode }) => (
  <span className="rounded-md bg-[#0090FF]/15 px-1.5 py-0.5 font-medium whitespace-nowrap text-[#0072cc] dark:text-[#5cb8ff]">{children}</span>
);

export function ApplePayScreen() {
  const { settings, transactions } = useData();
  const received = transactions.filter((t) => t.source === 'applepay');
  const last = settings.lastApplePayAt;
  const standalone = isStandalone();

  return (
    <Screen title="Apple Pay" back subtitle="Tes paiements ajoutés automatiquement">
      <Card className="mb-5 p-4">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-semibold">État</p>
          {last ? <Badge tone="positive">Actif ✅</Badge> : <Badge>Pas encore configuré</Badge>}
        </div>
        <p className="mt-1 text-[14px] text-label-2">
          {last
            ? `Dernier paiement reçu le ${new Date(last).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} · ${received.length} paiement(s) enregistré(s).`
            : 'Dès que tu paies avec Apple Pay, la dépense apparaît ici avec le bon montant, le commerçant et une catégorie devinée.'}
        </p>
        {!standalone && (
          <p className="mt-2 rounded-xl bg-warning-soft px-3 py-2 text-[13px]">
            ⚠️ Tu es dans Safari. Fais ces réglages depuis l'appli <strong>Budget</strong> de ton écran d'accueil.
          </p>
        )}
      </Card>

      <Section title="Étape 1 · Vérifier que ça peut marcher" footer="Ce test ajoute une dépense de 0,01 € nommée « Test Apple Pay » : supprime-la ensuite (glisse-la vers la gauche).">
        <Card className="px-4">
          <Step n={1} title="Copie le lien de test">
            <Button variant="tinted" icon="share" className="mt-1 min-h-11 text-[15px]" onClick={() => void copy(testUrl(), 'Lien de test')}>
              Copier le lien de test
            </Button>
          </Step>
          <Step n={2} title="Colle-le dans une note">
            <p>
              Ouvre l'app <Ui>Notes</Ui>, crée une note, colle le lien, puis <strong className="text-label">touche le lien</strong>.
            </p>
          </Step>
          <Step n={3} title="Regarde ce qui s'ouvre">
            <p>
              ✅ <strong className="text-label">L'appli Budget</strong> s'ouvre et affiche « Test Apple Pay · 0,01 € ajouté » → passe à l'étape 2.
            </p>
            <p>
              ❌ <strong className="text-label">Safari</strong> s'ouvre avec « Ouvert dans Safari » → arrête-toi là et préviens-moi : on utilisera une autre méthode.
            </p>
          </Step>
        </Card>
      </Section>

      <Section title="Étape 2 · Créer l'automatisation (5 min, une seule fois)">
        <Card className="px-4">
          <Step n={1} title="Copie le début de l'adresse">
            <Button variant="tinted" icon="share" className="mt-1 min-h-11 text-[15px]" onClick={() => void copy(prefixUrl(), 'Adresse')}>
              Copier l'adresse
            </Button>
            <p className="font-mono text-[12px] break-all">{prefixUrl()}</p>
          </Step>
          <Step n={2} title="Ouvre l'app Raccourcis">
            <p>
              Onglet <Ui>Automatisation</Ui> en bas, puis <Ui>+</Ui> en haut à droite (ou <Ui>Nouvelle automatisation</Ui>).
            </p>
          </Step>
          <Step n={3} title="Choisis le déclencheur de paiement">
            <p>
              Fais défiler et touche <Ui>Transaction</Ui> (il peut aussi s'appeler <Ui>Cartes</Ui> ou <Ui>Wallet</Ui>).
            </p>
            <p>
              Coche <strong className="text-label">ta carte Crédit Agricole</strong>, laisse les catégories et les commerçants sur « tous ».
            </p>
            <p>
              Choisis <Ui>Exécuter immédiatement</Ui> et désactive <Ui>Me notifier lors de l'exécution</Ui> si l'option apparaît. Touche{' '}
              <Ui>Suivant</Ui>, puis <Ui>Créer un raccourci</Ui> (ou <Ui>Nouveau raccourci vide</Ui>).
            </p>
          </Step>
          <Step n={4} title="Action 1 : « Texte » avec le montant et le commerçant">
            <p>
              Touche <Ui>Ajouter une action</Ui>, cherche <Ui>Texte</Ui> et ajoute-la. Dans la zone de texte :
            </p>
            <p>
              • touche la variable <Var>Entrée du raccourci</Var> au-dessus du clavier, puis touche-la à nouveau et choisis <Var>Montant</Var> ;
            </p>
            <p>
              • tape le caractère <strong className="font-mono text-label">|</strong> (barre verticale : clavier <Ui>123</Ui> puis <Ui>#+=</Ui>) ;
            </p>
            <p>
              • ajoute encore <Var>Entrée du raccourci</Var> et choisis <Var>Commerçant</Var> (ou <Var>Marchand</Var>).
            </p>
            <p>
              Résultat : <Var>Montant</Var>
              <strong className="font-mono text-label">|</strong>
              <Var>Commerçant</Var>
            </p>
          </Step>
          <Step n={5} title="Action 2 : encoder le texte">
            <p>
              Cherche <Ui>encoder</Ui> et ajoute <Ui>Encoder l'URL</Ui> (ou <Ui>Encoder/Décoder l'URL</Ui>, réglé sur « Encoder »). Elle prend
              automatiquement le <Var>Texte</Var> précédent.
            </p>
          </Step>
          <Step n={6} title="Action 3 : un second « Texte » avec l'adresse">
            <p>
              Ajoute une nouvelle action <Ui>Texte</Ui>, <strong className="text-label">colle l'adresse</strong> copiée à l'étape 1, puis, juste après
              (sans espace), ajoute la variable <Var>Texte encodé en URL</Var> (le résultat de l'action 2, son nom peut varier légèrement).
            </p>
          </Step>
          <Step n={7} title="Action 4 : ouvrir l'appli">
            <p>
              Cherche et ajoute <Ui>Ouvrir les URL</Ui>. Elle doit utiliser le <Var>Texte</Var> de l'action 3. Touche <Ui>OK</Ui> : c'est fini !
            </p>
          </Step>
        </Card>
      </Section>

      <Section title="Comment ça marche ensuite">
        <Card className="space-y-2 p-4 text-[15px] text-label-2">
          <p>📲 Tu paies avec Apple Pay → l'appli Budget s'ouvre et ajoute la dépense, avec la date du jour et ton compte par défaut.</p>
          <p>🏷️ La catégorie est devinée d'après le commerçant (Carrefour → Courses, SNCF → Transport…).</p>
          <p>
            🧠 Si elle est fausse, touche <strong className="text-label">Modifier</strong> et corrige-la : l'appli s'en souviendra pour ce commerçant.
          </p>
          <p>🔁 Un même paiement reçu deux fois en moins de 3 minutes n'est compté qu'une fois.</p>
          <p>
            ⚠️ Seuls les paiements <strong className="text-label">Apple Pay</strong> sont captés (pas la carte physique ni les prélèvements). Apple
            peut aussi, rarement, ne pas déclencher le raccourci : jette un œil à tes opérations de temps en temps.
          </p>
        </Card>
      </Section>
    </Screen>
  );
}
