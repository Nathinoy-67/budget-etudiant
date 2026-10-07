import { useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { useNav } from '../stores/nav';

/**
 * Écran avec grand titre façon iOS : le titre se réduit dans la barre du haut au défilement.
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
    <div className="absolute inset-0 flex flex-col bg-bg">
      <header
        className={`pt-safe absolute inset-x-0 top-0 z-20 transition-colors duration-200 ${
          scrolled ? 'border-b border-separator bg-[var(--tabbar)] backdrop-blur-xl' : 'border-b border-transparent'
        }`}
      >
        <div className="grid h-11 grid-cols-[1fr_auto_1fr] items-center px-1">
          <div className="justify-self-start">
            {back && (
              <button onClick={pop} className="flex min-h-11 items-center gap-0.5 pr-3 pl-1 text-[17px] text-accent" aria-label="Retour">
                <Icon name="chevronLeft" size={26} strokeWidth={2.4} />
                <span>Retour</span>
              </button>
            )}
          </div>
          <h1
            className={`max-w-[55vw] truncate text-[17px] font-semibold transition-opacity duration-200 ${scrolled ? 'opacity-100' : 'opacity-0'}`}
            aria-hidden={!scrolled}
          >
            {title}
          </h1>
          <div className="flex items-center justify-self-end pr-1">{actions}</div>
        </div>
      </header>
      <div
        ref={ref}
        className="scroll-area flex-1"
        onScroll={(e) => setScrolled((e.target as HTMLDivElement).scrollTop > 36)}
      >
        <div className="pt-safe">
          <div className="h-11" />
          <div className="px-4 pb-4">
            <h1 className="text-[32px] leading-tight font-bold tracking-[-0.025em]">{title}</h1>
            {subtitle && <div className="mt-0.5 text-[15px] text-label-2">{subtitle}</div>}
          </div>
          <div className={noPadding ? '' : 'px-4'}>{children}</div>
          {/* espace pour la barre d'onglets */}
          <div className="h-[calc(96px+env(safe-area-inset-bottom))]" />
        </div>
      </div>
    </div>
  );
}
