import { useState, type ReactNode } from 'react';
import { Screen } from '../../components/Screen';
import { Badge, Button, Card, Section, TextInput } from '../../components/ui';
import { useData } from '../../hooks/useData';
import { toast } from '../../stores/ui';
import { haptic } from '../../lib/haptics';
import { isStandalone } from '../../lib/notifications';
import { activateRelay, sendTestPayment, shortcutPostUrl, syncRelay, useExistingKey } from './relay';

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    haptic('success');
    toast(`${label} copiée`, { tone: 'success' });
  } catch {
    toast('Copie impossible : sélectionne le texte à la main', { tone: 'warning' });
  }
}

function Step({ n, title, children }: { n: number | string; title: string; children: ReactNode }) {
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
  const data = useData();
  const { settings, transactions } = data;
  const [busy, setBusy] = useState(false);
  const [alreadyLinked, setAlreadyLinked] = useState(false);
  const [manualKey, setManualKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const key = settings.relayKey;
  const received = transactions.filter((t) => t.source === 'applepay').length;
  const last = settings.lastApplePayAt;

  const activate = async () => {
    setBusy(true);
    const res = await activateRelay();
    setBusy(false);
    if (res === 'ok') {
      haptic('success');
      toast('Relais activé ✅', { tone: 'success' });
    } else if (res === 'already-linked') {
      setAlreadyLinked(true);
      toast('Ce relais est déjà lié à une clé', { tone: 'warning' });
    } else toast('Relais injoignable. Vérifie ta connexion Internet.', { tone: 'error' });
  };

  const test = async () => {
    if (!key) return;
    setBusy(true);
    const sent = await sendTestPayment(key);
    if (!sent) {
      setBusy(false);
      return toast('Le relais ne répond pas', { tone: 'error' });
    }
    // Le stockage Cloudflare peut mettre quelques secondes à propager le paiement
    for (let i = 0; i < 12; i++) {
      const got = await syncRelay(data);
      if (got.length) break;
      await new Promise((r) => setTimeout(r, 2500));
    }
    setBusy(false);
  };

  const linkExisting = async () => {
    setBusy(true);
    const ok = await useExistingKey(manualKey);
    setBusy(false);
    if (ok) {
      setAlreadyLinked(false);
      toast('Clé acceptée, relais relié ✅', { tone: 'success' });
    } else toast('Clé refusée par le relais', { tone: 'error' });
  };

  return (
    <Screen title="Apple Pay" back subtitle="Tes paiements ajoutés automatiquement">
      <Card className="mb-5 p-4">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-semibold">État</p>
          {last ? <Badge tone="positive">Actif ✅</Badge> : key ? <Badge tone="accent">Relais activé</Badge> : <Badge>À configurer</Badge>}
        </div>
        <p className="mt-1 text-[14px] text-label-2">
          {last
            ? `Dernier paiement reçu le ${new Date(last).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} · ${received} paiement(s) enregistré(s).`
            : 'Chaque paiement Apple Pay est envoyé en arrière-plan vers ton relais privé, puis ajouté ici dès que tu ouvres Budget.'}
        </p>
        {!isStandalone() && (
          <p className="mt-2 rounded-xl bg-warning-soft px-3 py-2 text-[13px]">
            ⚠️ Tu es dans Safari. Fais ces réglages depuis l'appli <strong>Budget</strong> de ton écran d'accueil.
          </p>
        )}
      </Card>

      <Section title="Étape 1 · Relier l'appli au relais">
        <Card className="px-4">
          {!key ? (
            <Step n={1} title="Active le relais">
              <p>L'appli crée une clé secrète et la confie à ton relais Cloudflare. Toi seul la connais.</p>
              <Button className="mt-1 min-h-11 text-[15px]" onClick={() => void activate()} disabled={busy}>
                {busy ? 'Activation…' : 'Activer le relais'}
              </Button>
              {alreadyLinked && (
                <div className="mt-3 rounded-xl bg-fill p-3">
                  <p className="text-[14px]">
                    Le relais a déjà une clé (créée sur un autre appareil ou avant une réinitialisation). Restaure ta sauvegarde, ou colle la clé
                    ci-dessous :
                  </p>
                  <TextInput value={manualKey} onChange={(e) => setManualKey(e.target.value)} placeholder="Clé du relais" aria-label="Clé du relais" className="mt-2" />
                  <Button variant="tinted" className="mt-2 min-h-11 text-[15px]" onClick={() => void linkExisting()} disabled={busy || manualKey.length < 20}>
                    Utiliser cette clé
                  </Button>
                </div>
              )}
            </Step>
          ) : (
            <>
              <Step n="✓" title="Relais activé">
                <p>Vérifie que tout fonctionne : l'appli envoie un faux paiement de 0,01 € au relais, puis le récupère.</p>
                <Button variant="tinted" className="mt-1 min-h-11 text-[15px]" onClick={() => void test()} disabled={busy}>
                  {busy ? 'Test en cours…' : 'Tester le relais'}
                </Button>
                <p className="text-[13px]">Tu dois voir « Test Apple Pay · 0,01 € ajouté » (supprime-le ensuite en le glissant vers la gauche).</p>
              </Step>
            </>
          )}
        </Card>
      </Section>

      {key && (
        <Section title="Étape 2 · Créer l'automatisation (5 min, une seule fois)" footer="Libellés de l'app Raccourcis en anglais (iOS 26). En français : Automatisation, Wallet, Exécuter immédiatement, Créer un raccourci, Obtenir le contenu de l'URL.">
          <Card className="px-4">
            <Step n={1} title="Copie l'adresse du relais">
              <Button variant="tinted" icon="share" className="mt-1 min-h-11 text-[15px]" onClick={() => void copy(shortcutPostUrl(key), 'Adresse')}>
                Copier l'adresse
              </Button>
              <p className="text-[13px]">Elle contient ta clé secrète : ne la partage pas.</p>
            </Step>
            <Step n={2} title="Crée l'automatisation">
              <p>
                Ouvre l'app <Ui>Shortcuts</Ui> → onglet <Ui>Automation</Ui> en bas → bouton <Ui>+</Ui> en haut à droite.
              </p>
              <p>
                Fais défiler la liste et touche <Ui>Wallet</Ui> (sur les anciennes versions : <Ui>Transaction</Ui>).
              </p>
            </Step>
            <Step n={3} title="Choisis ta carte">
              <p>
                Sous <Ui>When I tap</Ui>, touche <Ui>Choose</Ui> et coche <strong className="text-label">ta carte Crédit Agricole</strong>. Laisse les
                catégories et les commerçants (<Ui>Merchant</Ui>) sur « tous » s'ils apparaissent.
              </p>
              <p>
                Coche <Ui>Run Immediately</Ui> et décoche <Ui>Notify When Run</Ui> si l'option est là. Touche <Ui>Next</Ui>, puis{' '}
                <Ui>Create New Shortcut</Ui>.
              </p>
            </Step>
            <Step n={4} title="Ajoute l'action « Get Contents of URL »">
              <p>
                Touche <Ui>Add Action</Ui> (ou la barre de recherche en bas), tape <Ui>get contents</Ui> et choisis <Ui>Get Contents of URL</Ui>.
              </p>
              <p>
                Touche le mot bleu <Ui>URL</Ui> dans l'action et <strong className="text-label">colle l'adresse</strong> copiée à l'étape 1.
              </p>
            </Step>
            <Step n={5} title="Règle l'envoi">
              <p>
                Touche la petite flèche <Ui>›</Ui> à droite de l'action pour l'ouvrir. Mets <Ui>Method</Ui> sur <Ui>POST</Ui> et{' '}
                <Ui>Request Body</Ui> sur <Ui>JSON</Ui>.
              </p>
              <p>
                Touche <Ui>Add new field</Ui> → <Ui>Text</Ui>. Clé (<Ui>Key</Ui>) : <strong className="font-mono text-label">montant</strong>. Dans{' '}
                <Ui>Text</Ui>, touche <Var>Shortcut Input</Var> au-dessus du clavier, puis touche cette pastille bleue et choisis <Var>Amount</Var>.
              </p>
              <p>
                Ajoute un 2ᵉ champ <Ui>Text</Ui> : clé <strong className="font-mono text-label">marchand</strong>, valeur <Var>Shortcut Input</Var> →{' '}
                <Var>Merchant</Var>.
              </p>
              <p>
                Touche <Ui>Done</Ui> en haut à droite : c'est terminé !
              </p>
            </Step>
            <Step n="+" title="Facultatif : une notification de confirmation">
              <p>
                Ajoute l'action <Ui>Show Notification</Ui> avec par exemple « Budget : <Var>Amount</Var> chez <Var>Merchant</Var> ».
              </p>
            </Step>
          </Card>
        </Section>
      )}

      <Section title="Comment ça marche ensuite">
        <Card className="space-y-2 p-4 text-[15px] text-label-2">
          <p>📲 Tu paies avec Apple Pay → le raccourci envoie discrètement le montant et le commerçant à ton relais (rien ne s'ouvre).</p>
          <p>📥 Dès que tu ouvres Budget (ou dans les 15 s s'il est déjà ouvert), la dépense est ajoutée à la date du paiement.</p>
          <p>🏷️ La catégorie est devinée d'après le commerçant. Si elle est fausse, touche <strong className="text-label">Modifier</strong> : l'appli retiendra ton choix.</p>
          <p>🔒 Le relais t'appartient (ton compte Cloudflare). Les paiements y sont effacés dès qu'ils sont récupérés.</p>
          <p>
            ⚠️ Seuls les paiements <strong className="text-label">Apple Pay</strong> sont captés (pas la carte physique ni les virements). Apple peut,
            rarement, ne pas déclencher le raccourci.
          </p>
        </Card>
      </Section>

      {key && (
        <Section title="Avancé" footer="La clé est incluse dans tes sauvegardes JSON : après une réinstallation, restaurer la sauvegarde suffit.">
          <Card className="p-4">
            <button className="min-h-11 text-[15px] text-accent" onClick={() => setShowKey(!showKey)}>
              {showKey ? 'Masquer la clé du relais' : 'Afficher la clé du relais'}
            </button>
            {showKey && (
              <div className="mt-1">
                <p className="font-mono text-[13px] break-all">{key}</p>
                <Button variant="secondary" className="mt-2 min-h-10 text-[14px]" onClick={() => void copy(key, 'Clé')}>
                  Copier la clé
                </Button>
              </div>
            )}
          </Card>
        </Section>
      )}
    </Screen>
  );
}
