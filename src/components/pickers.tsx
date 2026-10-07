import { useState } from 'react';
import type { Account, Category, ID } from '../types';
import { EMOJI_CHOICES, PALETTE } from '../db/defaults';
import { haptic } from '../lib/haptics';
import { Icon } from './Icon';

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Couleur">
      {PALETTE.map((c) => (
        <button
          key={c}
          role="radio"
          aria-checked={value === c}
          aria-label={`Couleur ${c}`}
          onClick={() => {
            haptic('light');
            onChange(c);
          }}
          className="flex h-11 w-11 items-center justify-center rounded-full"
          style={{ background: c }}
        >
          {value === c && <Icon name="check" size={20} className="text-white" strokeWidth={3} />}
        </button>
      ))}
    </div>
  );
}

export function EmojiPicker({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  const [custom, setCustom] = useState('');
  return (
    <div>
      <div className="grid grid-cols-8 gap-1">
        {EMOJI_CHOICES.map((e) => (
          <button
            key={e}
            onClick={() => {
              haptic('light');
              onChange(e);
            }}
            aria-label={`Emoji ${e}`}
            aria-pressed={value === e}
            className={`flex h-11 items-center justify-center rounded-xl text-[22px] ${value === e ? 'bg-accent-soft ring-2 ring-accent' : ''}`}
          >
            {e}
          </button>
        ))}
      </div>
      <input
        value={custom}
        onChange={(e) => {
          setCustom(e.target.value);
          const first = [...new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(e.target.value)][0]?.segment;
          if (first) onChange(first);
        }}
        placeholder="…ou tape un autre emoji"
        aria-label="Autre emoji"
        className="mt-2 min-h-11 w-full rounded-xl bg-fill px-3 text-[16px]"
      />
    </div>
  );
}

/** Grille de catégories (sélection en un tap). */
export function CategoryGrid({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  value: ID | null;
  onChange: (id: ID) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Catégorie">
      {categories.map((c) => {
        const selected = value === c.id;
        return (
          <button
            key={c.id}
            role="radio"
            aria-checked={selected}
            onClick={() => {
              haptic('light');
              onChange(c.id);
            }}
            className={`pressable flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 transition-colors ${
              selected ? 'ring-2' : 'bg-fill'
            }`}
            style={selected ? { background: `${c.color}2e`, boxShadow: `inset 0 0 0 2px ${c.color}` } : undefined}
          >
            <span className="text-[22px] leading-none">{c.emoji}</span>
            <span className="line-clamp-1 w-full text-center text-[11px] font-medium text-label-2">{c.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Puces horizontales de sélection de compte. */
export function AccountChips({
  accounts,
  value,
  onChange,
  exclude,
  label = 'Compte',
}: {
  accounts: Account[];
  value: ID | null;
  onChange: (id: ID) => void;
  exclude?: ID | null;
  label?: string;
}) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="radiogroup" aria-label={label}>
      {accounts
        .filter((a) => !a.archived && a.id !== exclude)
        .map((a) => (
          <button
            key={a.id}
            role="radio"
            aria-checked={value === a.id}
            onClick={() => {
              haptic('light');
              onChange(a.id);
            }}
            className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-medium transition-colors ${
              value === a.id ? 'bg-accent text-white' : 'bg-fill text-label'
            }`}
          >
            <span>{a.emoji}</span>
            {a.name}
          </button>
        ))}
    </div>
  );
}
