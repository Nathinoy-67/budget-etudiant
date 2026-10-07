import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { formatMoney, type FormatOptions } from '../lib/money';
import { haptic } from '../lib/haptics';
import type { Cents } from '../types';

// ---------- Boutons ----------

type ButtonVariant = 'primary' | 'secondary' | 'plain' | 'destructive' | 'tinted';

export function Button({
  variant = 'primary',
  icon,
  children,
  className = '',
  block,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; icon?: IconName; block?: boolean }) {
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-accent text-white',
    secondary: 'bg-fill text-label',
    tinted: 'bg-accent-soft text-accent',
    plain: 'text-accent',
    destructive: 'bg-negative-soft text-negative',
  };
  return (
    <button
      className={`pressable inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-[17px] font-semibold disabled:opacity-40 ${
        styles[variant]
      } ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={20} />}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  className = '',
  size = 22,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; size?: number }) {
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
  return <span className={`tabular whitespace-nowrap ${color} ${className}`}>{formatMoney(cents, opts)}</span>;
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
    <section className={`mb-6 ${className}`}>
      {(title || action) && (
        <div className="mb-1.5 flex items-end justify-between px-4">
          {title && <h3 className="text-[13px] font-medium tracking-wide text-label-2 uppercase">{title}</h3>}
          {action}
        </div>
      )}
      {children}
      {footer && <p className="mt-1.5 px-4 text-[13px] text-label-2">{footer}</p>}
    </section>
  );
}

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  if (onClick)
    return (
      <button onClick={onClick} className={`pressable block w-full rounded-2xl bg-card text-left ${className}`}>
        {children}
      </button>
    );
  return <div className={`rounded-2xl bg-card ${className}`}>{children}</div>;
}

export function List({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl bg-card [&>*:not(:last-child)]:after:absolute [&>*:not(:last-child)]:after:right-0 [&>*:not(:last-child)]:after:bottom-0 [&>*:not(:last-child)]:after:left-14 [&>*:not(:last-child)]:after:h-px [&>*:not(:last-child)]:after:bg-separator ${className}`}>
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
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-white"
          style={{ background: iconBg ?? (emoji ? 'var(--fill)' : 'var(--accent)') }}
          aria-hidden="true"
        >
          {emoji ? <span className="text-[17px] leading-none">{emoji}</span> : icon && <Icon name={icon} size={18} />}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[17px] ${destructive ? 'text-negative' : ''}`}>{title}</span>
        {subtitle && <span className="block truncate text-[13px] text-label-2">{subtitle}</span>}
      </span>
      {value != null && <span className="shrink-0 text-right text-[17px] text-label-2">{value}</span>}
      {children}
      {chevron && <Icon name="chevronRight" size={18} className="shrink-0 text-label-3" />}
    </>
  );
  const cls = `relative flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left ${className}`;
  if (onClick)
    return (
      <button className={`${cls} active:bg-fill`} onClick={onClick}>
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
        className={`absolute h-[27px] w-[27px] rounded-full bg-white shadow-md transition-transform duration-200 ${
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
    <div role="radiogroup" aria-label={label} className={`flex rounded-[10px] bg-fill p-0.5 ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => {
            if (value !== o.value) haptic('light');
            onChange(o.value);
          }}
          className={`min-h-9 flex-1 rounded-[8px] px-2 text-[14px] font-semibold transition-all duration-200 ${
            value === o.value ? 'bg-elevated text-label shadow-sm dark:bg-[#636366]' : 'text-label-2'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: (id: string) => ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="mb-3">
      <label htmlFor={id} className="mb-1 block px-1 text-[13px] font-medium text-label-2">
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
      className={`min-h-12 w-full rounded-xl bg-fill px-3.5 text-[17px] text-label placeholder:text-label-3 focus:outline-2 focus:outline-accent ${className}`}
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
        className={`min-h-12 w-full appearance-none rounded-xl bg-fill px-3.5 pr-10 text-[17px] text-label ${className}`}
        {...rest}
      >
        {children}
      </select>
      <Icon name="chevronDown" size={18} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-label-3" />
    </div>
  );
}

// ---------- Progression ----------

export function levelColor(pct: number): string {
  if (pct >= 100) return 'var(--negative)';
  if (pct >= 80) return 'var(--warning)';
  return 'var(--positive)';
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
      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent">
        {emoji ? <span className="text-3xl">{emoji}</span> : icon && <Icon name={icon} size={30} />}
      </div>
      <p className="text-[17px] font-semibold">{title}</p>
      {text && <p className="mt-1 text-[15px] text-label-2">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
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
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold ${tones[tone]}`}>{children}</span>;
}

/** Pastille emoji sur fond coloré (catégories, comptes, objectifs). */
export function EmojiBadge({ emoji, color, size = 40 }: { emoji: string; color: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, background: `${color}26` }}
      aria-hidden="true"
    >
      <span style={{ fontSize: size * 0.5 }} className="leading-none">
        {emoji}
      </span>
    </span>
  );
}
