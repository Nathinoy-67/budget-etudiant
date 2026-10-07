import { useEffect } from 'react';
import type { ThemePref } from '../types';

/** Applique le thème (clair / sombre / automatique) et la couleur de la barre d'état. */
export function useTheme(pref: ThemePref) {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = pref === 'dark' || (pref === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      const color = dark ? '#000000' : '#F2F2F7';
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
        m.setAttribute('content', color);
        if (pref !== 'system') m.removeAttribute('media');
      });
    };
    apply();
    try {
      localStorage.setItem('be-theme', pref);
    } catch {
      /* stockage indisponible */
    }
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [pref]);
}
