import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { MotionConfig, MotionGlobalConfig } from 'motion/react';
import App from './app/App';
import { toast } from './stores/ui';
import './index.css';

// ?noanim : désactive les animations (tests automatisés, captures d'écran)
if (new URLSearchParams(location.search).has('noanim')) MotionGlobalConfig.skipAnimations = true;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);

// Service worker : mode hors ligne + mise à jour proposée à l'utilisateur
if ('serviceWorker' in navigator) {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      toast('Une nouvelle version est disponible', {
        duration: 15000,
        action: { label: 'Mettre à jour', onClick: () => void updateSW(true) },
      });
    },
    onOfflineReady() {
      toast("L'appli fonctionne maintenant hors ligne", { tone: 'success' });
    },
    onRegisteredSW(_url, reg) {
      // Vérifie les mises à jour toutes les heures quand l'appli reste ouverte
      if (reg) setInterval(() => void reg.update(), 60 * 60 * 1000);
    },
  });
}
