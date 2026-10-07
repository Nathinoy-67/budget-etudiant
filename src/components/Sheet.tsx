import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'motion/react';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Bouton à gauche du titre (par défaut : Annuler). */
  left?: ReactNode;
  /** Bouton à droite du titre (ex. OK). */
  right?: ReactNode;
  children: ReactNode;
  /** Contenu fixé en bas (boutons d'action). */
  footer?: ReactNode;
  /** Hauteur fixe quasi plein écran. */
  full?: boolean;
}

/**
 * Feuille modale façon iOS : glisse depuis le bas, se ferme en tirant la poignée vers le bas
 * ou en touchant le fond.
 */
export function Sheet({ open, onClose, title, left, right, children, footer, full }: SheetProps) {
  const controls = useDragControls();
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50" role="presentation">
          <motion.div
            className="absolute inset-0 bg-[var(--backdrop)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            className={`absolute inset-x-0 bottom-0 mx-auto flex max-w-xl flex-col rounded-t-[14px] bg-elevated shadow-2xl ${
              full ? 'h-[calc(100dvh-env(safe-area-inset-top)-12px)]' : 'max-h-[calc(100dvh-env(safe-area-inset-top)-12px)]'
            }`}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 34, stiffness: 380, mass: 0.9 }}
            drag="y"
            dragListener={false}
            dragControls={controls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={onDragEnd}
          >
            <div className="shrink-0 touch-none select-none" onPointerDown={(e) => controls.start(e)}>
              <div className="flex justify-center pt-2 pb-1">
                <div className="h-[5px] w-9 rounded-full bg-fill-2" />
              </div>
              {(title || left || right) && (
                <div className="grid min-h-11 grid-cols-[1fr_auto_1fr] items-center px-2 pb-1">
                  <div className="justify-self-start">
                    {left ?? (
                      <button className="min-h-11 px-2 text-[17px] text-accent" onClick={onClose}>
                        Annuler
                      </button>
                    )}
                  </div>
                  <h2 id={titleId} className="truncate px-1 text-center text-[17px] font-semibold">
                    {title}
                  </h2>
                  <div className="justify-self-end">{right}</div>
                </div>
              )}
            </div>
            <div className="scroll-area min-h-0 flex-1 px-4 pb-4">{children}</div>
            {footer && <div className="shrink-0 border-t border-separator px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div>}
            {!footer && <div className="shrink-0 pb-[env(safe-area-inset-bottom)]" />}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
