import { useMemo, useRef, useState } from 'react';
import { Screen } from '../../components/Screen';
import { Button, Card, EmptyState, Field, Money, Section, TextInput } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useData } from '../../hooks/useData';
import { useNav } from '../../stores/nav';
import { toast } from '../../stores/ui';
import { haptic } from '../../lib/haptics';
import { formatShortDate } from '../../lib/dates';
import { buildCandidates, decodeStatement, parseStatement, statementPreview, type ImportCandidate } from '../../lib/statement';
import { addTransaction } from '../../db/actions';

/** Import d'un relevé bancaire (CSV, OFX, QIF) téléchargé depuis l'espace client de la banque. */
export function ImportScreen() {
  const { transactions, categories, categoryById, settings, accounts, period, today } = useData();
  const pop = useNav((s) => s.pop);
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ImportCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [from, setFrom] = useState(period.start);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File) => {
    setError(null);
    setPreview(null);
    setFileName(file.name);
    try {
      const text = decodeStatement(await file.arrayBuffer());
      const parsed = parseStatement(text, file.name);
      if (!parsed || parsed.rows.length === 0) {
        setCandidates(null);
        setPreview(statementPreview(text));
        setError("Aucune opération reconnue dans ce fichier. Fais une capture de l'aperçu ci-dessous (les numéros de compte sont masqués) pour qu'on adapte la lecture à ton format.");
        return;
      }
      const c = buildCandidates(parsed.rows, transactions, categories, settings.merchantRules ?? {});
      setCandidates(c);
      setSelected(new Set(c.filter((x) => !x.duplicate).map((x) => x.key)));
      // Par défaut : depuis le début du mois en cours, ou la plus ancienne opération du fichier si plus récente
      const oldest = c[c.length - 1]?.date ?? period.start;
      setFrom(oldest > period.start ? oldest : period.start);
      haptic('success');
    } catch (e) {
      console.error(e);
      setError('Impossible de lire ce fichier.');
    }
  };

  const visible = useMemo(() => (candidates ?? []).filter((c) => c.date >= from), [candidates, from]);
  const toImport = visible.filter((c) => selected.has(c.key));
  const duplicates = visible.filter((c) => c.duplicate).length;

  const toggle = (key: string) => {
    haptic('light');
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  const doImport = async () => {
    const accountId = settings.defaultAccountId ?? accounts.find((a) => !a.archived)?.id;
    if (!accountId || !toImport.length) return;
    setBusy(true);
    for (const c of toImport) {
      await addTransaction({
        type: c.type,
        amount: Math.abs(c.amount),
        date: c.date,
        categoryId: c.categoryId,
        accountId,
        toAccountId: null,
        note: c.note,
        recurringId: null,
        occurrence: null,
        source: 'import',
        merchant: c.merchant,
      });
    }
    haptic('success');
    toast(`${toImport.length} opération${toImport.length > 1 ? 's' : ''} importée${toImport.length > 1 ? 's' : ''}`, { tone: 'success' });
    pop();
  };

  return (
    <Screen title="Importer un relevé" back>
      <input
        ref={fileInput}
        type="file"
        accept=".csv,.ofx,.qif,.txt,text/csv,text/plain,application/x-ofx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = '';
        }}
      />

      {!candidates && (
        <>
          <Section title="1. Télécharge tes opérations">
            <Card className="space-y-2.5 p-4 text-[14px] leading-snug text-label-2">
              <p>
                Dans <strong className="text-label">Safari</strong>, va sur <strong className="text-label">credit-agricole.fr</strong> et connecte-toi à ton
                espace client (l'appli Ma Banque ne permet généralement pas l'export).
              </p>
              <p>
                Ouvre ton <strong className="text-label">compte courant</strong>, puis cherche <strong className="text-label">« Télécharger »</strong> ou{' '}
                <strong className="text-label">« Exporter »</strong> (souvent dans « Mes opérations »). Choisis le format{' '}
                <strong className="text-label">CSV</strong> (ou OFX / QIF) et la période depuis le 1er du mois.
              </p>
              <p>Le fichier arrive dans l'app Fichiers, dossier Téléchargements. Les menus varient un peu selon les caisses régionales.</p>
            </Card>
          </Section>

          <Section title="2. Choisis le fichier">
            <Button block icon="upload" onClick={() => fileInput.current?.click()}>
              Choisir le fichier
            </Button>
            {error && (
              <p className="mt-3 rounded-xl bg-negative-soft px-3.5 py-2.5 text-[14px] text-negative" role="alert">
                {error}
              </p>
            )}
            {preview && (
              <div className="mt-3 rounded-xl bg-card p-3 shadow-card">
                <p className="mb-1.5 text-[12px] font-medium text-label-2">Début du fichier « {fileName} »</p>
                <pre className="overflow-x-auto text-[11px] leading-snug whitespace-pre-wrap text-label">{preview}</pre>
              </div>
            )}
          </Section>

          <p className="px-1 text-[13px] text-label-2">
            Les opérations déjà dans l'appli (loyer et aides ajoutés automatiquement, paiements Apple Pay, saisies à la main) sont repérées et ne sont pas
            importées en double. Rien n'est envoyé sur Internet.
          </p>
        </>
      )}

      {candidates && (
        <>
          <Card className="mb-4 p-4">
            <p className="truncate text-[13px] text-label-2">{fileName}</p>
            <p className="mt-0.5 text-[15px]">
              {candidates.length} opérations, du {formatShortDate(candidates[candidates.length - 1].date, today)} au {formatShortDate(candidates[0].date, today)}
            </p>
            <div className="mt-3">
              <Field label="Importer à partir du">
                {(id) => <TextInput id={id} type="date" value={from} max={today} onChange={(e) => e.target.value && setFrom(e.target.value)} />}
              </Field>
            </div>
            <button className="min-h-10 text-[14px] font-medium text-accent" onClick={() => fileInput.current?.click()}>
              Choisir un autre fichier
            </button>
          </Card>

          {visible.length === 0 ? (
            <EmptyState icon="calendar" title="Aucune opération depuis cette date" />
          ) : (
            <Section
              title={`${toImport.length} à importer`}
              footer={duplicates > 0 ? `${duplicates} opération${duplicates > 1 ? 's' : ''} déjà dans l'appli, décochée${duplicates > 1 ? 's' : ''} automatiquement.` : undefined}
            >
              <div className="overflow-hidden rounded-2xl bg-card shadow-card">
                {visible.map((c) => {
                  const on = selected.has(c.key);
                  const cat = c.categoryId ? categoryById.get(c.categoryId) : undefined;
                  return (
                    <button
                      key={c.key}
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(c.key)}
                      className="flex min-h-[60px] w-full items-center gap-3 border-b border-separator px-4 py-2 text-left last:border-0 active:bg-fill"
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-accent bg-accent text-white' : 'border-label-3'}`}
                        aria-hidden="true"
                      >
                        {on && <Icon name="check" size={14} strokeWidth={3} />}
                      </span>
                      <span className={`min-w-0 flex-1 ${on ? '' : 'opacity-50'}`}>
                        <span className="block truncate text-[15px] font-medium">
                          {cat?.emoji} {c.note}
                        </span>
                        <span className="block truncate text-[13px] text-label-2">
                          {formatShortDate(c.date, today)} · {cat?.name ?? 'Sans catégorie'}
                          {c.duplicate && ' · déjà dans l’appli'}
                        </span>
                      </span>
                      <Money
                        cents={c.amount}
                        sign={c.type === 'income'}
                        className={`text-[15px] font-semibold ${on ? '' : 'opacity-50'} ${c.type === 'income' ? 'text-positive' : 'text-negative'}`}
                      />
                    </button>
                  );
                })}
              </div>
            </Section>
          )}

          <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+72px)] z-10 pt-2">
            <Button block onClick={() => void doImport()} disabled={busy || toImport.length === 0} className="shadow-lg">
              {busy ? 'Import…' : `Importer ${toImport.length} opération${toImport.length > 1 ? 's' : ''}`}
            </Button>
          </div>
          <p className="mt-3 px-1 text-[13px] text-label-2">
            Les catégories sont devinées d'après le commerçant. Tu pourras les corriger ensuite en touchant l'opération : l'appli retiendra ton choix.
          </p>
        </>
      )}
    </Screen>
  );
}
