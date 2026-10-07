import { useMemo, useState } from 'react';
import { Screen } from '../../components/Screen';
import { Button, Card, IconButton, List, Money, Section, Segmented, Select, Toggle } from '../../components/ui';
import { useData } from '../../hooks/useData';
import { averageMonthlyByCategory, goalImpact, simulate } from '../../lib/simulator';
import { goalProgress } from '../../lib/goals';
import { monthlyEquivalent } from '../../lib/recurrence';
import { formatMoney } from '../../lib/money';
import { addMonths, formatMonthYear } from '../../lib/dates';
import type { ID } from '../../types';

interface Line {
  key: number;
  categoryId: ID;
  mode: 'amount' | 'percent';
  value: number; // € (entier) ou %
}

let k = 0;

export default function SimulatorScreen() {
  const { categories, transactions, today, recurrings, goals, contributions } = useData();
  const averages = useMemo(() => averageMonthlyByCategory(transactions, today), [transactions, today]);
  const expenseCats = categories.filter((c) => c.kind === 'expense' && !c.archived);
  const defaultCat = expenseCats.find((c) => c.name.startsWith('Restau'))?.id ?? expenseCats[0]?.id ?? '';
  const [lines, setLines] = useState<Line[]>(() => [{ key: k++, categoryId: defaultCat, mode: 'amount', value: 30 }]);
  const [cancelled, setCancelled] = useState<ID[]>([]);
  const [extraIncome, setExtraIncome] = useState(0);
  const [horizon, setHorizon] = useState<'12' | '24' | '60'>('12');

  const subs = recurrings.filter((r) => r.active && r.type === 'expense' && (r.isSubscription || r.categoryId === categories.find((c) => c.name === 'Abonnements')?.id));

  const lineSaving = (l: Line) => {
    const avg = averages.get(l.categoryId) ?? 0;
    return l.mode === 'amount' ? l.value * 100 : Math.round((avg * l.value) / 100);
  };

  const adjustments = [
    ...lines.map((l) => ({ monthly: lineSaving(l) })),
    ...subs.filter((s) => cancelled.includes(s.id)).map((s) => ({ monthly: monthlyEquivalent(s.amount, s.frequency, s.interval) })),
    { monthly: extraIncome * 100 },
  ];
  const result = simulate(adjustments, Number(horizon));

  const activeGoals = goals.filter((g) => !g.archived).map((g) => ({ g, p: goalProgress(g, contributions, today) })).filter((x) => !x.p.reached);

  return (
    <Screen title="Et si… ?" back subtitle="Teste des économies et vois leur effet">
      <Card className="mb-5 bg-gradient-to-br from-[#12A594] to-[#0b7a6d] p-5 text-white">
        <p className="text-[15px] text-white/85">Tu économiserais</p>
        <p className="text-[38px] leading-tight font-bold tracking-tight tabular">{formatMoney(result.yearly)}</p>
        <p className="text-[15px] text-white/90">
          par an, soit <strong className="tabular">{formatMoney(result.monthly)}</strong> par mois
        </p>
        <div className="mt-3 rounded-xl bg-white/15 px-3 py-2 text-[14px]">
          Sur {Number(horizon) / 12 >= 1 ? `${Number(horizon) / 12} an${Number(horizon) > 12 ? 's' : ''}` : `${horizon} mois`} :{' '}
          <strong className="tabular">{formatMoney(result.total)}</strong>
          {result.total > 0 && ` · ${Math.floor(result.total / 150000) > 0 ? `≈ ${Math.floor(result.total / 150000)} permis de conduire 🚗` : `≈ ${Math.floor(result.total / 1100)} menus kebab 🌯`}`}
        </div>
      </Card>

      <Segmented
        label="Horizon"
        className="mb-5"
        value={horizon}
        onChange={setHorizon}
        options={[
          { value: '12', label: '1 an' },
          { value: '24', label: '2 ans' },
          { value: '60', label: '5 ans' },
        ]}
      />

      <Section title="Réduire une dépense">
        <div className="space-y-3">
          {lines.map((l) => {
            const avg = averages.get(l.categoryId) ?? 0;
            const saving = lineSaving(l);
            return (
              <Card key={l.key} className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex-1">
                    <Select
                      aria-label="Catégorie"
                      value={l.categoryId}
                      onChange={(e) => setLines(lines.map((x) => (x.key === l.key ? { ...x, categoryId: e.target.value } : x)))}
                    >
                      {expenseCats.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.emoji} {c.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  {lines.length > 1 && (
                    <IconButton icon="x" label="Retirer cette ligne" className="text-label-3" onClick={() => setLines(lines.filter((x) => x.key !== l.key))} />
                  )}
                </div>
                <Segmented
                  label="Type de réduction"
                  className="mb-3"
                  value={l.mode}
                  onChange={(mode) => setLines(lines.map((x) => (x.key === l.key ? { ...x, mode, value: mode === 'percent' ? 25 : 30 } : x)))}
                  options={[
                    { value: 'amount', label: 'En euros' },
                    { value: 'percent', label: 'En %' },
                  ]}
                />
                <label className="block">
                  <span className="mb-1 flex justify-between text-[15px]">
                    <span>{l.mode === 'amount' ? 'Réduction par mois' : 'Réduction'}</span>
                    <strong className="tabular">{l.mode === 'amount' ? `${l.value} €` : `${l.value} %`}</strong>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={l.mode === 'amount' ? Math.max(100, Math.ceil(avg / 100 / 10) * 10) : 100}
                    step={l.mode === 'amount' ? 5 : 5}
                    value={l.value}
                    onChange={(e) => setLines(lines.map((x) => (x.key === l.key ? { ...x, value: Number(e.target.value) } : x)))}
                    className="h-11 w-full accent-[var(--accent)]"
                    aria-label="Montant de la réduction"
                  />
                </label>
                <p className="text-[13px] text-label-2">
                  Tu dépenses en moyenne <strong className="text-label">{formatMoney(avg)}</strong>/mois ici.{' '}
                  {saving > 0 && (
                    <>
                      → <strong className="text-label">{formatMoney(saving)}/mois</strong>, {formatMoney(saving * 12)}/an.
                    </>
                  )}
                  {l.mode === 'amount' && avg > 0 && saving > avg && <span className="text-warning"> (plus que ta dépense actuelle !)</span>}
                </p>
              </Card>
            );
          })}
          <Button variant="tinted" icon="plus" block onClick={() => setLines([...lines, { key: k++, categoryId: defaultCat, mode: 'amount', value: 20 }])}>
            Ajouter une réduction
          </Button>
        </div>
      </Section>

      {subs.length > 0 && (
        <Section title="Résilier un abonnement">
          <List>
            {subs.map((s) => (
              <div key={s.id} className="relative flex min-h-[52px] items-center gap-3 px-4">
                <span className="text-[20px]">{s.emoji ?? '📱'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px]">{s.name}</span>
                  <span className="text-[13px] text-label-2">{formatMoney(monthlyEquivalent(s.amount, s.frequency, s.interval))}/mois</span>
                </span>
                <Toggle
                  checked={cancelled.includes(s.id)}
                  onChange={(v) => setCancelled(v ? [...cancelled, s.id] : cancelled.filter((x) => x !== s.id))}
                  label={`Résilier ${s.name}`}
                />
              </div>
            ))}
          </List>
        </Section>
      )}

      <Section title="Gagner plus">
        <Card className="p-4">
          <label className="block">
            <span className="mb-1 flex justify-between text-[15px]">
              <span>Revenu en plus par mois (job, baby-sitting…)</span>
              <strong className="tabular">{extraIncome} €</strong>
            </span>
            <input
              type="range"
              min={0}
              max={600}
              step={10}
              value={extraIncome}
              onChange={(e) => setExtraIncome(Number(e.target.value))}
              className="h-11 w-full accent-[var(--accent)]"
              aria-label="Revenu supplémentaire mensuel"
            />
          </label>
        </Card>
      </Section>

      {activeGoals.length > 0 && result.monthly > 0 && (
        <Section title="Impact sur tes objectifs" footer="Si tu verses ces économies en plus de ton rythme actuel d'épargne.">
          <List>
            {activeGoals.map(({ g, p }) => {
              const base = Math.max(p.recentMonthlyAverage, 0);
              const imp = goalImpact(p.remaining, base, result.monthly);
              return (
                <div key={g.id} className="relative flex min-h-[60px] items-center gap-3 px-4 py-2">
                  <span className="text-[22px]">{g.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-medium">{g.name}</span>
                    <span className="block text-[13px] text-label-2">
                      {imp.after != null && `Atteint vers ${formatMonthYear(addMonths(today, imp.after))}`}
                      {imp.gained != null && imp.gained > 0 && ` · ${imp.gained} mois plus tôt`}
                      {imp.before == null && ' (au lieu de jamais au rythme actuel)'}
                    </span>
                  </span>
                  <Money cents={p.remaining} compact className="text-[14px] text-label-2" />
                </div>
              );
            })}
          </List>
        </Section>
      )}
    </Screen>
  );
}
