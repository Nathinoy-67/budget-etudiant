import { useId, type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { formatMoney, type FormatOptions } from '../lib/money';
import { haptic } from '../lib/haptics';
import type { Cents } from '../types';

// ---------- Boutons ----------

type ButtonVariant = 'primary' | 'secondary' | 'plain' | 'destructive' | 'tinted';

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  className = '',
  block,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'md' | 'sm'; icon?: IconName; block?: boolean }) {
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-brand text-white shadow-brand disabled:shadow-none',
    secondary: 'bg-fill text-label',
    tinted: 'bg-accent-soft text-accent',
    plain: 'text-accent',
    destructive: 'bg-negative-soft text-negative',
  };
  const sizes = {
    md: 'min-h-[52px] rounded-2xl px-5 text-[17px]',
    sm: 'min-h-10 rounded-xl px-3.5 text-[15px]',
  };
  return (
    <button
      className={`pressable inline-flex items-center justify-center gap-2 font-semibold tracking-[-0.01em] disabled:opacity-40 ${sizes[size]} ${styles[variant]} ${
        block ? 'w-full' : ''
      } ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 18 : 20} />}
      {children}
    </button>
  );
}

/** Bouton icône. `glass` : rond en verre dépoli, pour l'en-tête des écrans. */
export function IconButton({
  icon,
  label,
  className = '',
  size = 22,
  glass,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; size?: number; glass?: boolean }) {
  if (glass)
    return (
      <button aria-label={label} title={label} className={`pressable flex h-11 w-11 items-center justify-center ${className}`} {...rest}>
        <span className="glass flex h-9 w-9 items-center justify-center rounded-full border border-[var(--glass-border)] text-label shadow-[0_2px_10px_-4px_rgba(0,0,0,0.18)]">
          <Icon name={icon} size={size} strokeWidth={2.1} />
        </span>
      </button>
    );
  return (
    <button
      aria-label={label}
      title={label}
      className={`pressable inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-accent ${className}`}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

// ---------- Montants ----------

export function Money({
  cents,
  className = '',
  colored,
  ...opts
}: { cents: Cents; className?: string; colored?: boolean } & FormatOptions) {
  const color = colored ? (cents > 0 ? 'text-positive' : cents < 0 ? 'text-negative' : '') : '';
  return <span className={`font-rounded tabular whitespace-nowrap ${color} ${className}`}>{formatMoney(cents, opts)}</span>;
}

// ---------- Pastilles ----------

/**
 * Pastille carrée arrondie : emoji ou icône sur un fond teinté par la couleur de la catégorie
 * (fond neutre sans couleur).
 */
export function Tile({
  emoji,
  icon,
  color,
  size = 40,
  round,
  className = '',
  children,
}: {
  emoji?: string;
  icon?: IconName;
  color?: string | null;
  size?: number;
  round?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center ${color ? 'tint' : 'bg-fill text-label-2'} ${className}`}
      style={{ width: size, height: size, borderRadius: round ? size : Math.round(size * 0.32), ...(color ? { '--c': color } : {}) } as CSSProperties}
      aria-hidden="true"
    >
      {emoji ? (
        <span className="leading-none" style={{ fontSize: Math.round(size * 0.5) }}>
          {emoji}
        </span>
      ) : (
        icon && <Icon name={icon} size={Math.round(size * 0.5)} />
      )}
      {children}
    </span>
  );
}

// ---------- Listes groupées façon Réglages iOS ----------

export function Section({
  title,
  footer,
  children,
  action,
  className = '',
}: {
  title?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-8 ${className}`}>
      {(title || action) && (
        <div className="mb-2.5 flex min-h-7 items-center justify-between px-1">
          {title && <h3 className="text-[20px] font-bold tracking-[-0.025em] text-label">{title}</h3>}
          {action}
        </div>
      )}
      {children}
      {footer && <p className="mt-2.5 px-1 text-[13px] leading-snug text-label-2">{footer}</p>}
    </section>
  );
}

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  if (onClick)
    return (
      <button onClick={onClick} className={`pressable block w-full rounded-[22px] bg-card text-left shadow-card ${className}`}>
        {children}
      </button>
    );
  return <div className={`rounded-[22px] bg-card shadow-card ${className}`}>{children}</div>;
}

/**
 * Liste groupée ; `inset` : retrait à gauche des séparateurs (aligné sur le texte des lignes) ;
 * `flat` : sans ombre, sur le fond d'une feuille.
 */
export function List({ children, className = '', inset = 60, flat }: { children: ReactNode; className?: string; inset?: number; flat?: boolean }) {
  return (
    <div
      className={`overflow-hidden rounded-[22px] ${flat ? 'bg-sheet-card' : 'bg-card shadow-card'} [&>*:not(:last-child)]:after:absolute [&>*:not(:last-child)]:after:right-0 [&>*:not(:last-child)]:after:bottom-0 [&>*:not(:last-child)]:after:left-[var(--inset)] [&>*:not(:last-child)]:after:h-px [&>*:not(:last-child)]:after:bg-separator ${className}`}
      style={{ '--inset': `${inset}px` } as CSSProperties}
    >
      {children}
    </div>
  );
}

export function Row({
  icon,
  iconBg,
  emoji,
  title,
  subtitle,
  value,
  chevron,
  onClick,
  destructive,
  children,
  className = '',
}: {
  icon?: IconName;
  /** Couleur de la pastille (icône blanche dessus, façon Réglages iOS). */
  iconBg?: string;
  emoji?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  destructive?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const content = (
    <>
      {(icon || emoji) && (
        <span
          className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] ${
            iconBg ? 'text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]' : destructive ? 'bg-negative-soft text-negative' : 'bg-fill text-label-2'
          }`}
          style={iconBg ? { background: `linear-gradient(180deg, color-mix(in srgb, ${iconBg} 82%, #fff) 0%, ${iconBg} 100%)` } : undefined}
          aria-hidden="true"
        >
          {emoji ? <span className="text-[16px] leading-none">{emoji}</span> : icon && <Icon name={icon} size={17} strokeWidth={2.1} />}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[16px] tracking-[-0.01em] ${destructive ? 'text-negative' : ''}`}>{title}</span>
        {subtitle && <span className="block truncate text-[13px] text-label-2">{subtitle}</span>}
      </span>
      {value != null && <span className="shrink-0 text-right text-[16px] text-label-2">{value}</span>}
      {children}
      {chevron && <Icon name="chevronRight" size={17} strokeWidth={2.2} className="shrink-0 text-label-3" />}
    </>
  );
  const cls = `relative flex min-h-[54px] w-full items-center gap-3.5 px-4 py-2 text-left ${className}`;
  if (onClick)
    return (
      <button className={`${cls} transition-colors active:bg-fill`} onClick={onClick}>
        {content}
      </button>
    );
  return <div className={cls}>{content}</div>;
}

// ---------- Contrôles ----------

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        haptic('light');
        onChange(!checked);
      }}
      className={`relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-40 ${
        checked ? 'bg-[#34C759]' : 'bg-fill-2'
      }`}
    >
      <span
        className={`absolute h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)] transition-transform duration-200 ${
          checked ? 'translate-x-[22px]' : 'translate-x-[2px]'
        }`}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className = '',
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`flex rounded-full bg-fill p-1 ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => {
            if (value !== o.value) haptic('light');
            onChange(o.value);
          }}
          className={`min-h-9 flex-1 rounded-full px-2 text-[14px] font-semibold tracking-[-0.01em] transition-all duration-200 ${
            value === o.value ? 'bg-elevated text-label shadow-[0_1px_2px_rgba(0,0,0,0.06),0_3px_10px_-2px_rgba(0,0,0,0.12)] dark:bg-[#3a3a42]' : 'text-label-2'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Curseur façon iOS (piste remplie jusqu'à la valeur). */
export function Range({
  value,
  min,
  max,
  step,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const pct = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="range"
      style={{ '--pct': `${pct}%` } as CSSProperties}
      aria-label={label}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: (id: string) => ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="mb-3.5">
      <label htmlFor={id} className="mb-1.5 block px-1 text-[13px] font-medium text-label-2">
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1 px-1 text-[12px] text-label-2">{hint}</p>}
    </div>
  );
}

export function TextInput({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`min-h-12 w-full rounded-2xl bg-fill px-4 text-[17px] text-label transition-shadow placeholder:text-label-3 focus:shadow-[0_0_0_2px_var(--accent)] focus:outline-none ${className}`}
      {...rest}
    />
  );
}

export function Select({
  className = '',
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <div className="relative">
      <select
        className={`min-h-12 w-full appearance-none rounded-2xl bg-fill px-4 pr-10 text-[17px] text-label ${className}`}
        {...rest}
      >
        {children}
      </select>
      <Icon name="chevronDown" size={18} className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-label-3" />
    </div>
  );
}

// ---------- Progression ----------

export function levelColor(pct: number): string {
  if (pct >= 100) return 'var(--negative)';
  if (pct >= 80) return 'var(--warning)';
  return 'var(--accent)';
}

export function ProgressBar({
  pct,
  color,
  className = '',
  label,
  height = 8,
}: {
  pct: number;
  color?: string;
  className?: string;
  label?: string;
  height?: number;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={`w-full overflow-hidden rounded-full bg-fill ${className}`}
      style={{ height }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${clamped}%`, background: color ?? levelColor(pct) }}
      />
    </div>
  );
}

export function Ring({
  pct,
  size = 120,
  stroke = 12,
  color,
  children,
  label,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color ?? levelColor(pct)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (clamped / 100) * c}
          style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

// ---------- Divers ----------

export function EmptyState({
  icon,
  emoji,
  title,
  text,
  action,
}: {
  icon?: IconName;
  emoji?: string;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-8 py-10 text-center">
      <div className="bg-brand shadow-brand mb-4 flex h-16 w-16 items-center justify-center rounded-[22px] text-white">
        {emoji ? <span className="text-3xl">{emoji}</span> : icon && <Icon name={icon} size={28} strokeWidth={2.1} />}
      </div>
      <p className="text-[18px] font-semibold tracking-[-0.015em]">{title}</p>
      {text && <p className="mt-1.5 text-[15px] leading-snug text-label-2">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'positive' | 'negative' | 'warning' | 'accent' }) {
  const tones = {
    default: 'bg-fill text-label-2',
    positive: 'bg-positive-soft text-positive',
    negative: 'bg-negative-soft text-negative',
    warning: 'bg-warning-soft text-warning',
    accent: 'bg-accent-soft text-accent',
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${tones[tone]}`}>{children}</span>;
}

/** Pastille emoji, teintée par la couleur de la catégorie si elle est donnée. */
export function EmojiBadge({ emoji, color, size = 40 }: { emoji: string; color?: string; size?: number }) {
  return <Tile emoji={emoji} color={color} size={size} />;
}
