import { useMemo, useState } from 'react';
import { Screen } from '../../components/Screen';
import { Button, Card, IconButton, List, Range, Section, Segmented, Select, Tile, Toggle } from '../../components/ui';
import { useData } from '../../hooks/useData';
import { averageMonthlyByCategory, simulate } from '../../lib/simulator';
import { monthlyEquivalent } from '../../lib/recurrence';
import { formatMoney } from '../../lib/money';
import type { ID } from '../../types';

interface Line {
  key: number;
  categoryId: ID;
  mode: 'amount' | 'percent';
  value: number; // € (entier) ou %
}

let k = 0;

export default function SimulatorScreen() {
  const { categories, transactions, today, recurrings } = useData();
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


  return (
    <Screen title="Et si… ?" back subtitle="Teste des économies et vois leur effet">
      <div className="hero mb-5 overflow-hidden rounded-[28px] p-5">
        <p className="text-[12px] font-semibold tracking-[0.09em] text-on-ink-2 uppercase">Tu économiserais</p>
        <p className={`font-rounded mt-2.5 text-[44px] leading-none font-semibold tracking-[-0.035em] ${result.yearly > 0 ? 'text-hero-positive' : ''}`}>
          {formatMoney(result.yearly)}
        </p>
        <p className="mt-2.5 text-[15px] text-on-ink-2">
          par an, soit <span className="font-rounded font-semibold text-on-ink">{formatMoney(result.monthly)}</span> par mois
        </p>
        <div className="mt-5 border-t border-white/12 pt-3.5 text-[14px] text-on-ink-2">
          Sur {Number(horizon) / 12} an{Number(horizon) > 12 ? 's' : ''} : <span className="font-rounded font-semibold text-on-ink">{formatMoney(result.total)}</span>
        </div>
      </div>

      <Segmented
        label="Horizon"
        className="mb-8"
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
                    <strong className="font-rounded tabular">{l.mode === 'amount' ? `${l.value} €` : `${l.value} %`}</strong>
                  </span>
                  <Range
                    min={0}
                    max={l.mode === 'amount' ? Math.max(100, Math.ceil(avg / 100 / 10) * 10) : 100}
                    step={5}
                    value={l.value}
                    onChange={(v) => setLines(lines.map((x) => (x.key === l.key ? { ...x, value: v } : x)))}
                    label="Montant de la réduction"
                  />
                </label>
                <p className="text-[13px] text-label-2">
                  Tu dépenses en moyenne <strong className="text-label">{formatMoney(avg)}</strong>/mois ici.{' '}
                  {saving > 0 && (
                    <>
                      → <strong className="text-positive">{formatMoney(saving)}/mois</strong>, {formatMoney(saving * 12)}/an.
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
          <List inset={66}>
            {subs.map((s) => (
              <div key={s.id} className="relative flex min-h-[62px] items-center gap-3 px-4">
                <Tile emoji={s.emoji ?? '📱'} color={categories.find((c) => c.id === s.categoryId)?.color} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold tracking-[-0.01em]">{s.name}</span>
                  <span className="text-[13px] text-negative">{formatMoney(monthlyEquivalent(s.amount, s.frequency, s.interval))}/mois</span>
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
              <strong className="font-rounded tabular">{extraIncome} €</strong>
            </span>
            <Range min={0} max={600} step={10} value={extraIncome} onChange={setExtraIncome} label="Revenu supplémentaire mensuel" />
          </label>
        </Card>
      </Section>

    </Screen>
  );
}
