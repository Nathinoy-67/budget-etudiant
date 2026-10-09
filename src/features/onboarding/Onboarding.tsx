import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button, TextInput, Toggle } from '../../components/ui';
import { useData } from '../../hooks/useData';
import { addRecurring, updateSettings } from '../../db/actions';
import { db } from '../../db/db';
import { startDemoMode } from '../../db/demo';
import { daysInMonth, parts, toISO } from '../../lib/dates';
import { formatMoney, parseAmount } from '../../lib/money';
import { haptic } from '../../lib/haptics';
import { toast } from '../../stores/ui';

interface IncomeLine {
  key: string;
  label: string;
  emoji: string;
  categoryName: string;
  amount: string;
  day: number;
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

function DaySelect({ value, onChange, label }: { value: number; onChange: (d: number) => void; label: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="min-h-12 shrink-0 rounded-xl bg-fill px-2 text-[16px] text-label"
    >
      {DAYS.map((d) => (
        <option key={d} value={d}>
          le {d}
        </option>
      ))}
    </select>
  );
}

export function Onboarding() {
  const { categories, accounts, today } = useData();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [incomes, setIncomes] = useState<IncomeLine[]>([
    { key: 'job', label: 'Job étudiant / salaire', emoji: '💼', categoryName: 'Job étudiant', amount: '', day: 1 },
    { key: 'apl', label: 'APL / CAF', emoji: '🏛️', categoryName: 'APL / CAF', amount: '', day: 5 },
    { key: 'bourse', label: 'Bourse', emoji: '🎓', categoryName: 'Bourse', amount: '', day: 10 },
    { key: 'parents', label: 'Virement des parents', emoji: '👨‍👩‍👧', categoryName: 'Parents / famille', amount: '', day: 1 },
  ]);
  const [startDay, setStartDay] = useState(1);
  const [rent, setRent] = useState('');
  const [rentDay, setRentDay] = useState(5);
  const expenseCats = categories.filter((c) => c.kind === 'expense');
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(expenseCats.map((c) => c.id)));
  const [busy, setBusy] = useState(false);

  const totalIncome = incomes.reduce((s, i) => s + (parseAmount(i.amount || '0') ?? 0), 0);
  const rentCents = parseAmount(rent || '0') ?? 0;

  const go = (n: number) => {
    haptic('light');
    setDir(n > step ? 1 : -1);
    setStep(n);
  };

  const finish = async () => {
    setBusy(true);
    try {
      const { y, m } = parts(today);
      const dateFor = (day: number) => toISO(y, m, Math.min(day, daysInMonth(y, m)));
      const courant = accounts.find((a) => a.type === 'courant') ?? accounts[0];
      const catByName = (n: string) => categories.find((c) => c.name === n);

      for (const line of incomes) {
        const cents = parseAmount(line.amount || '0') ?? 0;
        if (cents <= 0) continue;
        const cat = catByName(line.categoryName);
        const start = dateFor(line.day);
        await addRecurring({
          name: line.label.replace(' / salaire', ''),
          type: 'income',
          amount: cents,
          categoryId: cat?.id ?? null,
          accountId: courant.id,
          toAccountId: null,
          frequency: 'monthly',
          interval: 1,
          startDate: start,
          endDate: null,
          active: true,
          isSubscription: false,
          remindDaysBefore: 2,
          emoji: line.emoji,
        });
      }
      if (rentCents > 0) {
        const start = dateFor(rentDay);
        await addRecurring({
          name: 'Loyer',
          type: 'expense',
          amount: rentCents,
          categoryId: catByName('Loyer')?.id ?? null,
          accountId: courant.id,
          toAccountId: null,
          frequency: 'monthly',
          interval: 1,
          startDate: start,
          endDate: null,
          active: true,
          isSubscription: false,
          remindDaysBefore: 2,
          emoji: '🏠',
        });
      }

      await db.transaction('rw', db.categories, async () => {
        for (const c of expenseCats) await db.categories.update(c.id, { archived: !enabled.has(c.id) });
      });
      await updateSettings({ onboarded: true, monthStartDay: startDay });
      haptic('success');
      toast('C’est parti !', { tone: 'success' });
    } catch (e) {
      console.error(e);
      toast('Oups, une erreur est survenue', { tone: 'error' });
      setBusy(false);
    }
  };

  const demo = async () => {
    setBusy(true);
    await startDemoMode();
    toast('Données exemple chargées, explore l’appli', { tone: 'success' });
  };

  const screens = [
    // 1. Revenus
    <div key="income">
      <p className="mb-1 text-[40px]">👋</p>
      <h1 className="text-[30px] leading-tight font-bold tracking-tight">Bienvenue !</h1>
      <p className="mt-1 mb-5 text-[16px] text-label-2">
        En 3 étapes, on configure ton budget. Tout reste sur ton téléphone. Commençons par <strong className="text-label">ce que tu touches chaque mois</strong>.
      </p>
      <div className="space-y-2.5">
        {incomes.map((line, i) => (
          <div key={line.key} className="rounded-2xl bg-card p-3">
            <p className="mb-2 text-[15px] font-medium">
              {line.emoji} {line.label}
            </p>
            <div className="flex gap-2">
              <TextInput
                inputMode="decimal"
                placeholder="0 €"
                aria-label={`Montant ${line.label}`}
                value={line.amount}
                onChange={(e) => setIncomes(incomes.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
              />
              <DaySelect label={`Jour de versement ${line.label}`} value={line.day} onChange={(d) => setIncomes(incomes.map((x, j) => (j === i ? { ...x, day: d } : x)))} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-2xl bg-card p-3">
        <label htmlFor="startDay" className="text-[15px]">
          Mon mois budgétaire commence
        </label>
        <DaySelect label="Premier jour du mois budgétaire" value={startDay} onChange={setStartDay} />
      </div>
      <p className="mt-1.5 px-1 text-[13px] text-label-2">Astuce : choisis le jour où tombe ton principal revenu.</p>
      {totalIncome > 0 && (
        <p className="mt-4 text-center text-[17px]">
          Total : <strong className="tabular">{formatMoney(totalIncome)}</strong> / mois
        </p>
      )}
    </div>,

    // 2. Loyer
    <div key="rent">
      <p className="mb-1 text-[40px]">🏠</p>
      <h1 className="text-[30px] leading-tight font-bold tracking-tight">Ton loyer</h1>
      <p className="mt-1 mb-5 text-[16px] text-label-2">C'est souvent la plus grosse charge. Il sera déduit automatiquement chaque mois.</p>
      <div className="rounded-2xl bg-card p-3">
        <p className="mb-2 text-[15px] font-medium">Loyer (charges comprises, avant APL)</p>
        <div className="flex gap-2">
          <TextInput inputMode="decimal" placeholder="0 €" aria-label="Montant du loyer" value={rent} onChange={(e) => setRent(e.target.value)} />
          <DaySelect label="Jour de paiement du loyer" value={rentDay} onChange={setRentDay} />
        </div>
      </div>
      {totalIncome > 0 && (
        <div className="mt-5 rounded-2xl bg-card p-4 text-center shadow-card">
          <p className="text-[15px] text-label-2">Après le loyer, il te reste</p>
          <p className="text-[30px] font-semibold tracking-[-0.02em] tabular">{formatMoney(totalIncome - rentCents)}</p>
          <p className="text-[15px] text-label-2">chaque mois pour vivre</p>
        </div>
      )}
    </div>,

    // 3. Catégories
    <div key="cats">
      <p className="mb-1 text-[40px]">🗂️</p>
      <h1 className="text-[30px] leading-tight font-bold tracking-tight">Tes catégories</h1>
      <p className="mt-1 mb-5 text-[16px] text-label-2">Garde celles qui te concernent. Tu pourras en créer d'autres (nom, emoji, couleur).</p>
      <div className="overflow-hidden rounded-2xl bg-card">
        {expenseCats.map((c) => (
          <div key={c.id} className="flex min-h-[52px] items-center gap-3 border-b border-separator px-4 last:border-0">
            <span className="text-[22px]">{c.emoji}</span>
            <span className="flex-1 text-[16px]">{c.name}</span>
            <Toggle
              checked={enabled.has(c.id)}
              onChange={(v) => {
                const next = new Set(enabled);
                if (v) next.add(c.id);
                else next.delete(c.id);
                setEnabled(next);
              }}
              label={c.name}
              disabled={c.name === 'Autre'}
            />
          </div>
        ))}
      </div>
    </div>,
  ];

  return (
    <div className="pt-safe fixed inset-0 flex flex-col bg-bg">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex gap-1.5" aria-label={`Étape ${step + 1} sur 3`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={`h-2 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-accent' : 'w-2 bg-fill-2'}`} />
          ))}
        </div>
        {step < 2 ? (
          <button className="min-h-11 px-2 text-[16px] text-label-2" onClick={() => go(step + 1)}>
            Passer
          </button>
        ) : (
          <span className="min-h-11" />
        )}
      </div>
      <div className="scroll-area relative flex-1 overflow-x-hidden px-5 pb-6">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={step}
            custom={dir}
            initial={{ x: dir * 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -dir * 60, opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            {screens[step]}
          </motion.div>
        </AnimatePresence>
        {step === 0 && (
          <button onClick={() => void demo()} disabled={busy} className="mx-auto mt-6 block min-h-11 px-3 text-[15px] text-accent">
            ✨ Juste tester ? Charger des données exemple
          </button>
        )}
      </div>
      <div className="flex gap-2 border-t border-separator px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        {step > 0 && (
          <Button variant="secondary" onClick={() => go(step - 1)}>
            Retour
          </Button>
        )}
        {step < 2 ? (
          <Button block onClick={() => go(step + 1)}>
            Continuer
          </Button>
        ) : (
          <Button block onClick={() => void finish()} disabled={busy}>
            Terminer
          </Button>
        )}
      </div>
    </div>
  );
}
