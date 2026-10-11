import { useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { useNav } from '../stores/nav';

/**
 * Écran avec grand titre façon iOS : le titre se réduit dans une barre en verre dépoli au défilement.
 */
export function Screen({
  title,
  back,
  actions,
  children,
  subtitle,
  noPadding,
}: {
  title: string;
  back?: boolean;
  actions?: ReactNode;
  children: ReactNode;
  subtitle?: ReactNode;
  noPadding?: boolean;
}) {
  const pop = useNav((s) => s.pop);
  const [scrolled, setScrolled] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className="screen-glow absolute inset-0 flex flex-col">
      <header
        className={`pt-safe absolute inset-x-0 top-0 z-20 border-b transition-colors duration-200 ${
          scrolled ? 'glass border-separator' : 'border-transparent'
        }`}
      >
        <div className="grid h-12 grid-cols-[1fr_auto_1fr] items-center px-1.5">
          <div className="justify-self-start">
            {back && (
              <button onClick={pop} className="pressable flex h-11 w-11 items-center justify-center" aria-label="Retour">
                <span className="glass flex h-9 w-9 items-center justify-center rounded-full border border-[var(--glass-border)] text-label shadow-[0_2px_10px_-4px_rgba(0,0,0,0.18)]">
                  <Icon name="chevronLeft" size={22} strokeWidth={2.4} className="-translate-x-px" />
                </span>
              </button>
            )}
          </div>
          <h1
            className={`max-w-[55vw] truncate text-[17px] font-semibold tracking-[-0.015em] transition-opacity duration-200 ${scrolled ? 'opacity-100' : 'opacity-0'}`}
            aria-hidden={!scrolled}
          >
            {title}
          </h1>
          <div className="flex items-center justify-self-end">{actions}</div>
        </div>
      </header>
      <div
        ref={ref}
        className="scroll-area flex-1"
        onScroll={(e) => setScrolled((e.target as HTMLDivElement).scrollTop > 40)}
      >
        <div className="pt-safe">
          <div className="h-12" />
          <div className="px-5 pb-5">
            <h1 className="text-[34px] leading-[1.1] font-bold tracking-[-0.035em]">{title}</h1>
            {subtitle && <div className="mt-1 text-[15px] text-label-2">{subtitle}</div>}
          </div>
          <div className={noPadding ? '' : 'px-4'}>{children}</div>
          {/* espace pour la barre d'onglets flottante */}
          <div className="h-[calc(112px+env(safe-area-inset-bottom))]" />
        </div>
      </div>
    </div>
  );
}
