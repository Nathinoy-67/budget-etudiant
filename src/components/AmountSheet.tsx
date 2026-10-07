import { useEffect, useState, type ReactNode } from 'react';
import { Sheet } from './Sheet';
import { Keypad } from './Keypad';
import { Button } from './ui';
import { centsToInput, formatMoney, parseAmount } from '../lib/money';
import { haptic } from '../lib/haptics';

/** Feuille de saisie d'un montant au pavé numérique (budgets, versements…). */
export function AmountSheet({
  open,
  onClose,
  title,
  initial,
  onSave,
  onClear,
  clearLabel = 'Supprimer',
  saveLabel = 'Enregistrer',
  children,
  allowZero,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  initial?: number | null;
  onSave: (cents: number) => void | Promise<void>;
  onClear?: () => void | Promise<void>;
  clearLabel?: string;
  saveLabel?: string;
  children?: ReactNode;
  allowZero?: boolean;
}) {
  const [value, setValue] = useState('');
  useEffect(() => {
    if (open) setValue(initial ? centsToInput(initial) : '');
  }, [open, initial]);
  const cents = parseAmount(value || '0') ?? 0;
  const valid = allowZero ? cents >= 0 : cents > 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div>
          <Keypad value={value} onChange={setValue} compact />
          <div className="mt-2 flex gap-2">
            {onClear && (
              <Button variant="destructive" onClick={() => void Promise.resolve(onClear()).then(onClose)}>
                {clearLabel}
              </Button>
            )}
            <Button
              block
              disabled={!valid}
              onClick={async () => {
                haptic('success');
                await onSave(cents);
                onClose();
              }}
            >
              {saveLabel}
            </Button>
          </div>
        </div>
      }
    >
      <p className={`my-4 text-center text-[44px] leading-none font-bold tracking-tight tabular ${value ? '' : 'opacity-30'}`} aria-live="polite">
        {value ? formatMoney(cents) : formatMoney(0)}
      </p>
      {children}
    </Sheet>
  );
}
