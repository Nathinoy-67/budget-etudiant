import { useEffect, useState } from 'react';
import { Screen } from '../../components/Screen';
import { List, Row, Section, Segmented, Toggle } from '../../components/ui';
import { Sheet } from '../../components/Sheet';
import { confirmAction } from '../../components/Overlays';
import { useData } from '../../hooks/useData';
import { toast, useLock } from '../../stores/ui';
import { updateSettings, resetAll, ensureInitialized } from '../../db/actions';
import { loadDemoData } from '../../db/demo';
import { CURRENCIES } from '../../db/defaults';
import { biometricAvailable, hashPin, registerBiometric, verifyPin } from '../../lib/security';
import { isStandalone, notificationPermission, notificationsSupported, notify, requestNotificationPermission } from '../../lib/notifications';
import { buildIcs } from '../../lib/ics';
import { saveFile } from '../../lib/files';
import { haptic } from '../../lib/haptics';
import { exportCSV, exportJSON, pickAndImportJSON } from './backupActions';
import { useNav } from '../../stores/nav';
import { PinPad } from '../security/LockScreen';
import type { ThemePref } from '../../types';

const selectCls = 'min-h-11 max-w-[55%] appearance-none bg-transparent text-right text-[16px] text-label-2 outline-none';

export function SettingsScreen() {
  const { settings, today, transactions } = useData();
  const push = useNav((s) => s.push);
  const [pinSheet, setPinSheet] = useState<'set' | 'disable' | null>(null);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [perm, setPerm] = useState(notificationPermission());
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string | null>(null);

  useEffect(() => {
    void biometricAvailable().then(setBioAvailable);
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    void navigator.storage
      ?.estimate?.()
      .then((e) => e.usage != null && setUsage(`${(e.usage / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`))
      .catch(() => undefined);
  }, []);

  const set = (patch: Parameters<typeof updateSettings>[0]) => void updateSettings(patch);
  const notif = settings.notifications;

  const askNotif = async () => {
    const p = await requestNotificationPermission();
    setPerm(p);
    if (p === 'granted') {
      toast('Notifications activées', { tone: 'success' });
      void notify('Budget Étudiant', 'Les notifications fonctionnent.', 'test');
    } else if (p === 'denied') toast('Refusé. Réactive-les dans Réglages iPhone → Notifications → Budget.', { tone: 'warning', duration: 5000 });
  };

  const enableBiometric = async () => {
    try {
      const id = await registerBiometric();
      await updateSettings({ biometricId: id });
      haptic('success');
      toast('Face ID / Touch ID activé', { tone: 'success' });
    } catch (e) {
      console.warn(e);
      toast("Impossible d'activer Face ID / Touch ID sur cet appareil", { tone: 'error' });
    }
  };

  const dailyIcs = async () => {
    const ics = buildIcs([
      {
        uid: 'daily-reminder',
        title: '💸 Note tes dépenses du jour',
        description: 'Ouvre Budget Étudiant et ajoute tes dépenses (30 secondes).',
        date: today,
        time: notif.reminderTime,
        rrule: 'FREQ=DAILY',
        alarmMinutesBefore: 0,
      },
    ]);
    const res = await saveFile(ics, 'rappel-budget-quotidien.ics', 'text/calendar');
    if (res !== 'cancelled') toast('Ouvre le fichier pour ajouter le rappel au Calendrier', { duration: 4000 });
  };

  const notifSupported = notificationsSupported();
  const standalone = isStandalone();

  return (
    <Screen title="Réglages">
      <Section title="Mon budget" footer="Début du mois : si tes revenus tombent le 5, choisis le 5 (le mois ira du 5 au 4).">
        <List>
          <Row icon="upload" title="Importer un relevé bancaire" subtitle="Récupère tes opérations d'un coup (CSV, OFX)" chevron onClick={() => push('import')} />
          <Row icon="repeat" title="Revenus et charges fixes" subtitle="Salaire, APL, loyer, abonnements…" chevron onClick={() => push('recurrings')} />
          <Row icon="tag" title="Catégories" chevron onClick={() => push('categories')} />
          <Row
            icon="zap"
            title="Paiements Apple Pay"
            subtitle={settings.lastApplePayAt ? 'Ajout automatique actif' : 'Ajoute tes achats automatiquement'}
            chevron
            onClick={() => push('applepay')}
          />
          <Row icon="calendar" title="Début du mois">
            <select aria-label="Premier jour du mois" className={selectCls} value={settings.monthStartDay} onChange={(e) => set({ monthStartDay: Number(e.target.value) })}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d === 1 ? 'Le 1er' : `Le ${d}`}
                  {d > 28 ? ' (ou dernier jour)' : ''}
                </option>
              ))}
            </select>
          </Row>
          <Row icon="wallet" title="Devise">
            <select aria-label="Devise" className={selectCls} value={settings.currency} onChange={(e) => set({ currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </Row>
        </List>
      </Section>

      <Section title="Apparence">
        <div className="mb-3">
          <Segmented<ThemePref>
            label="Thème"
            value={settings.theme}
            onChange={(theme) => set({ theme })}
            options={[
              { value: 'system', label: 'Auto' },
              { value: 'light', label: 'Clair' },
              { value: 'dark', label: 'Sombre' },
            ]}
          />
        </div>
        <List>
          <Row icon="zap" title="Retour haptique" subtitle="Vibrations légères (iOS 18+)">
            <Toggle checked={settings.haptics} onChange={(haptics) => set({ haptics })} label="Retour haptique" />
          </Row>
        </List>
      </Section>

      <Section title="Sécurité" footer="Le code reste sur ton téléphone (haché). Il protège des regards indiscrets, pas d'un accès technique à l'appareil.">
        <List>
          <Row icon="lock" iconBg="#8D8D8D" title="Code PIN">
            <Toggle checked={!!settings.pin} onChange={(v) => setPinSheet(v ? 'set' : 'disable')} label="Activer le code PIN" />
          </Row>
          {settings.pin && <Row icon="edit" iconBg="#8D8D8D" title="Changer le code" chevron onClick={() => setPinSheet('set')} />}
          {settings.pin && bioAvailable && (
            <Row icon="faceid" iconBg="#30A46C" title="Face ID / Touch ID">
              <Toggle checked={!!settings.biometricId} onChange={(v) => (v ? void enableBiometric() : set({ biometricId: null }))} label="Face ID / Touch ID" />
            </Row>
          )}
          {settings.pin && (
            <Row icon="refresh" iconBg="#0090FF" title="Verrouiller après">
              <select aria-label="Délai de verrouillage" className={selectCls} value={settings.lockAfterMinutes} onChange={(e) => set({ lockAfterMinutes: Number(e.target.value) })}>
                <option value={0}>Immédiatement</option>
                <option value={1}>1 minute</option>
                <option value={5}>5 minutes</option>
                <option value={15}>15 minutes</option>
                <option value={60}>1 heure</option>
              </select>
            </Row>
          )}
          {settings.pin && <Row icon="lock" iconBg="#E5484D" title="Verrouiller maintenant" onClick={() => useLock.getState().setLocked(true)} />}
        </List>
      </Section>

      <Section
        title="Notifications"
        footer={
          !notifSupported
            ? "Sur iPhone, les notifications nécessitent iOS 16.4+ et l'appli ajoutée à l'écran d'accueil (Partager → Sur l'écran d'accueil)."
            : 'Les alertes sont envoyées quand tu ouvres l’appli. Pour un rappel quotidien même appli fermée, ajoute-le au Calendrier.'
        }
      >
        <List>
          {notifSupported && perm !== 'granted' && (
            <Row icon="bell" iconBg="#E5484D" title="Autoriser les notifications" subtitle={perm === 'denied' ? 'Refusées — à réactiver dans Réglages iPhone' : undefined} chevron onClick={() => void askNotif()} />
          )}
          {!notifSupported && !standalone && <Row icon="info" iconBg="#8D8D8D" title="Installe l'appli pour les notifications" />}
          <Row icon="pie" iconBg="#F76B15" title="Alertes de budget (80 % / 100 %)">
            <Toggle checked={notif.budgetAlerts} onChange={(v) => set({ notifications: { ...notif, budgetAlerts: v } })} label="Alertes de budget" />
          </Row>
          <Row icon="card" iconBg="#8E4EC6" title="Renouvellements d'abonnements">
            <Toggle checked={notif.subscriptionReminders} onChange={(v) => set({ notifications: { ...notif, subscriptionReminders: v } })} label="Rappels d'abonnements" />
          </Row>
          <Row icon="bell" iconBg="#0090FF" title="Rappel quotidien">
            <Toggle checked={notif.dailyReminder} onChange={(v) => set({ notifications: { ...notif, dailyReminder: v } })} label="Rappel quotidien" />
          </Row>
          {notif.dailyReminder && (
            <Row icon="calendar" iconBg="#0090FF" title="Heure du rappel">
              <input
                type="time"
                aria-label="Heure du rappel"
                value={notif.reminderTime}
                onChange={(e) => e.target.value && set({ notifications: { ...notif, reminderTime: e.target.value } })}
                className="min-h-11 bg-transparent text-right text-[17px] text-label-2"
              />
            </Row>
          )}
          <Row icon="calendar" iconBg="#30A46C" title="Ajouter le rappel au Calendrier" subtitle="Fiable même appli fermée" chevron onClick={() => void dailyIcs()} />
        </List>
      </Section>

      <Section
        title="Sauvegarde"
        footer={
          <>
            Dernière sauvegarde : {settings.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'jamais'}.
            {' '}Tes données ne quittent jamais ton téléphone. iOS peut les effacer si l'appli n'est pas utilisée pendant plusieurs semaines : enregistre une copie dans Fichiers / iCloud Drive.
            {persisted === true && ' Stockage persistant accordé.'}
            {usage && ` Espace utilisé : ${usage}.`}
          </>
        }
      >
        <List>
          <Row icon="download" iconBg="#30A46C" title="Exporter une sauvegarde (JSON)" chevron onClick={() => void exportJSON()} />
          <Row icon="upload" iconBg="#0090FF" title="Restaurer une sauvegarde" chevron onClick={pickAndImportJSON} />
          <Row icon="share" iconBg="#5B5BD6" title="Exporter les opérations (CSV)" subtitle="Pour Excel / Numbers" chevron onClick={() => void exportCSV()} />
          <Row icon="bell" iconBg="#FFB224" title="Rappel de sauvegarde">
            <select aria-label="Fréquence du rappel de sauvegarde" className={selectCls} value={settings.backupReminderDays} onChange={(e) => set({ backupReminderDays: Number(e.target.value) })}>
              <option value={7}>Chaque semaine</option>
              <option value={14}>Toutes les 2 semaines</option>
              <option value={30}>Chaque mois</option>
              <option value={0}>Jamais</option>
            </select>
          </Row>
        </List>
      </Section>

      <Section title="Données">
        <List>
          <Row
            icon="sparkles"
            iconBg="#8E4EC6"
            title="Charger des données exemple"
            subtitle="Remplace tes données par 3 mois fictifs"
            onClick={async () => {
              const ok = await confirmAction({
                title: 'Charger les données exemple ?',
                message: transactions.length ? 'Tes données actuelles seront remplacées. Pense à faire une sauvegarde avant.' : undefined,
                confirmLabel: 'Charger',
                destructive: transactions.length > 0,
              });
              if (!ok) return;
              toast('Chargement des données exemple…');
              await loadDemoData();
              toast('Données exemple chargées', { tone: 'success' });
            }}
          />
          <Row
            icon="trash"
            iconBg="#E5484D"
            title="Tout réinitialiser"
            destructive
            onClick={async () => {
              const ok = await confirmAction({
                title: 'Effacer toutes les données ?',
                message: 'Opérations, comptes, objectifs, réglages… Cette action est définitive.',
                confirmLabel: 'Tout effacer',
                destructive: true,
              });
              if (!ok) return;
              const sure = await confirmAction({ title: 'Vraiment sûr ? Aucune annulation possible.', confirmLabel: 'Oui, tout effacer', destructive: true });
              if (!sure) return;
              await resetAll();
              await ensureInitialized();
              toast('Toutes les données ont été effacées');
            }}
          />
        </List>
      </Section>

      <Section title="À propos">
        <List>
          <Row icon="info" iconBg="#8D8D8D" title="Budget Étudiant" value={`v${__APP_VERSION__}`} />
          <Row icon="shield" iconBg="#30A46C" title="100 % local, sans compte ni pub" subtitle="Aucune donnée n'est envoyée sur Internet" />
          {!standalone && <Row icon="download" iconBg="#5B5BD6" title="Installer sur l'iPhone" subtitle="Safari → Partager → « Sur l'écran d'accueil »" />}
        </List>
      </Section>

      <PinSheet mode={pinSheet} onClose={() => setPinSheet(null)} />
    </Screen>
  );
}

function PinSheet({ mode, onClose }: { mode: 'set' | 'disable' | null; onClose: () => void }) {
  const { settings } = useData();
  const [step, setStep] = useState<'current' | 'new' | 'confirm'>('new');
  const [first, setFirst] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mode) return;
    setStep(settings.pin ? 'current' : 'new');
    setFirst('');
    setError(null);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPin = async (pin: string) => {
    setError(null);
    if (step === 'current') {
      if (!settings.pin || !(await verifyPin(pin, settings.pin))) {
        haptic('error');
        return setError('Code incorrect');
      }
      if (mode === 'disable') {
        await updateSettings({ pin: null, biometricId: null });
        toast('Code PIN désactivé');
        return onClose();
      }
      return setStep('new');
    }
    if (step === 'new') {
      if (/^(\d)\1{3}$/.test(pin) || pin === '1234') toast('Astuce : évite les codes trop simples', { tone: 'warning' });
      setFirst(pin);
      return setStep('confirm');
    }
    if (pin !== first) {
      haptic('error');
      setStep('new');
      return setError('Les codes ne correspondent pas, recommence');
    }
    await updateSettings({ pin: await hashPin(pin) });
    useLock.getState().setLocked(false);
    haptic('success');
    toast('Code PIN enregistré', { tone: 'success' });
    onClose();
  };

  const title = step === 'current' ? 'Code actuel' : step === 'new' ? 'Nouveau code à 4 chiffres' : 'Confirme le code';
  return (
    <Sheet open={!!mode} onClose={onClose} title={mode === 'disable' ? 'Désactiver le code' : 'Code PIN'}>
      <div className="py-4">
        <PinPad key={step} title={title} error={error} onComplete={(p) => void onPin(p)} />
      </div>
    </Sheet>
  );
}
