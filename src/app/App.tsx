import { useEffect, useRef, useState } from 'react';
import { DataProvider, useData } from '../hooks/useData';
import { ensureInitialized, generateDueRecurring, requestPersistentStorage, simplifyToSingleAccount } from '../db/actions';
import { Shell } from './Shell';
import { Onboarding } from '../features/onboarding/Onboarding';
import { LockScreen } from '../features/security/LockScreen';
import { useLock, useTxSheet } from '../stores/ui';
import { setHapticsEnabled } from '../lib/haptics';
import { runForegroundChecks } from '../features/alerts';
import { useTheme } from '../hooks/useTheme';
import { Toaster, ConfirmHost } from '../components/Overlays';
import { hasIncomingPayment, receiveApplePay } from '../features/applepay/receive';
import { syncRelay } from '../features/applepay/relay';
import { ApplePayInSafari } from '../features/applepay/ApplePayInSafari';
import { isIOSSafariTab } from '../lib/notifications';

function Splash() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-bg">
      <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width={72} height={72} className="animate-pulse rounded-[18px]" />
    </div>
  );
}

function Root() {
  const data = useData();
  const { settings } = data;
  const { locked, setLocked } = useLock();
  const hiddenAt = useRef<number | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  useTheme(settings.theme);
  setHapticsEnabled(settings.haptics);

  // Pas de code PIN → jamais verrouillé
  useEffect(() => {
    if (!settings.pin) setLocked(false);
  }, [settings.pin, setLocked]);

  // Retour au premier plan : verrouillage différé, génération des récurrences, alertes
  useEffect(() => {
    const onVisibility = async () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        return;
      }
      const s = dataRef.current.settings;
      if (s.pin && hiddenAt.current && Date.now() - hiddenAt.current >= s.lockAfterMinutes * 60_000) setLocked(true);
      hiddenAt.current = null;
      await generateDueRecurring();
      void syncRelay(dataRef.current);
      void runForegroundChecks(dataRef.current);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [setLocked]);

  // Vérifications au lancement (une fois)
  useEffect(() => {
    if (settings.onboarded) {
      // Paiement Apple Pay transmis par le raccourci iOS (?applepay=…)
      void receiveApplePay(dataRef.current);
      // Paiements Apple Pay en attente sur le relais Cloudflare
      void syncRelay(dataRef.current);
      void runForegroundChecks(dataRef.current);
    }
    // Raccourci de l'icône (manifest) : ?action=add
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'add') {
      useTxSheet.getState().openNew();
      history.replaceState(null, '', location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.onboarded]);

  // Relais Apple Pay : vérifie régulièrement tant que l'appli est ouverte
  useEffect(() => {
    if (!settings.onboarded || !settings.relayKey) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void syncRelay(dataRef.current);
    }, 15_000);
    return () => clearInterval(id);
  }, [settings.onboarded, settings.relayKey]);

  // Lien de paiement ouvert dans Safari au lieu de l'appli installée : données séparées sur iOS
  if (hasIncomingPayment() && isIOSSafariTab()) return <ApplePayInSafari />;

  if (!settings.onboarded)
    return (
      <>
        <Onboarding />
        <Toaster />
        <ConfirmHost />
      </>
    );

  return (
    <>
      <Shell />
      {settings.pin && locked && <LockScreen />}
    </>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await ensureInitialized();
        await simplifyToSingleAccount();
        await generateDueRecurring();
        setReady(true);
        void requestPersistentStorage();
      } catch (e) {
        console.error(e);
        setError(
          "Impossible d'ouvrir la base de données locale. En navigation privée, le stockage peut être bloqué : ouvre l'appli dans un onglet normal.",
        );
      }
    })();
  }, []);

  if (error)
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-bg p-8 text-center">
        <p className="text-[17px]">{error}</p>
      </div>
    );
  if (!ready) return <Splash />;
  return (
    <DataProvider fallback={<Splash />}>
      <Root />
    </DataProvider>
  );
}
