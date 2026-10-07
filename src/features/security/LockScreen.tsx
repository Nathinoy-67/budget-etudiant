import { useEffect, useState } from 'react';
import { motion, useAnimation } from 'motion/react';
import { useData } from '../../hooks/useData';
import { useLock } from '../../stores/ui';
import { verifyBiometric, verifyPin } from '../../lib/security';
import { haptic } from '../../lib/haptics';
import { Icon } from '../../components/Icon';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;

/** Pavé de code PIN à 4 chiffres (réutilisé pour la création du code). */
export function PinPad({ onComplete, title, subtitle, error }: { onComplete: (pin: string) => void; title: string; subtitle?: string; error?: string | null }) {
  const [pin, setPin] = useState('');
  const shake = useAnimation();

  useEffect(() => {
    if (error) {
      setPin('');
      void shake.start({ x: [0, -14, 14, -10, 10, -4, 0], transition: { duration: 0.4 } });
    }
  }, [error, shake]);

  const press = (d: string) => {
    haptic('light');
    if (d === 'back') return setPin(pin.slice(0, -1));
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) setTimeout(() => {
      onComplete(next);
      setPin('');
    }, 120);
  };

  return (
    <div className="flex flex-col items-center">
      <p className="text-[20px] font-semibold">{title}</p>
      <p className={`mt-1 min-h-5 text-[15px] ${error ? 'text-negative' : 'text-label-2'}`} aria-live="assertive">
        {error ?? subtitle}
      </p>
      <motion.div animate={shake} className="my-7 flex gap-5" aria-label={`${pin.length} chiffre(s) saisi(s) sur 4`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-3.5 w-3.5 rounded-full border-2 border-label transition-colors ${i < pin.length ? 'bg-label' : ''}`} />
        ))}
      </motion.div>
      <div className="grid grid-cols-3 gap-x-6 gap-y-4">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'].map((d, i) =>
          d === '' ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              onClick={() => press(d)}
              aria-label={d === 'back' ? 'Effacer' : d}
              className={`flex h-[76px] w-[76px] items-center justify-center rounded-full text-[32px] font-normal ${d === 'back' ? '' : 'bg-fill active:bg-fill-2'}`}
            >
              {d === 'back' ? <Icon name="backspace" size={28} /> : d}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

export function LockScreen() {
  const { settings } = useData();
  const setLocked = useLock((s) => s.setLocked);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (lockedUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const unlock = () => {
    haptic('success');
    setLocked(false);
  };

  const tryPin = async (pin: string) => {
    if (!settings.pin || Date.now() < lockedUntil) return;
    if (await verifyPin(pin, settings.pin)) return unlock();
    haptic('error');
    const n = attempts + 1;
    setAttempts(n);
    if (n >= MAX_ATTEMPTS) {
      setLockedUntil(Date.now() + LOCKOUT_MS);
      setNow(Date.now());
      setAttempts(0);
      setError('Trop d’essais. Réessaie dans 30 s.');
    } else setError(`Code incorrect (${MAX_ATTEMPTS - n} essai${MAX_ATTEMPTS - n > 1 ? 's' : ''} restant${MAX_ATTEMPTS - n > 1 ? 's' : ''})`);
  };

  const tryBiometric = async () => {
    if (!settings.biometricId) return;
    if (await verifyBiometric(settings.biometricId)) unlock();
    else setError('Face ID / Touch ID non reconnu');
  };

  const waiting = lockedUntil > now;

  return (
    <div className="pt-safe pb-safe fixed inset-0 z-[90] flex flex-col items-center justify-center bg-bg" role="dialog" aria-modal="true" aria-label="Appli verrouillée">
      <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width={56} height={56} className="mb-6 rounded-[14px]" />
      <div className={waiting ? 'pointer-events-none opacity-40' : ''}>
        <PinPad
          title="Entre ton code"
          subtitle={waiting ? `Patiente ${Math.ceil((lockedUntil - now) / 1000)} s` : 'Budget Étudiant est verrouillé'}
          error={waiting ? `Patiente ${Math.ceil((lockedUntil - now) / 1000)} s` : error}
          onComplete={(p) => void tryPin(p)}
        />
      </div>
      {settings.biometricId && (
        <button onClick={() => void tryBiometric()} className="mt-6 flex min-h-11 items-center gap-2 px-4 text-[17px] text-accent">
          <Icon name="faceid" size={24} /> Utiliser Face ID / Touch ID
        </button>
      )}
    </div>
  );
}
