/**
 * Notifications locales.
 *
 * Sur iPhone, les notifications web ne sont disponibles que pour une PWA ajoutée à l'écran
 * d'accueil (iOS 16.4+), après autorisation explicite. Une PWA ne peut pas programmer de
 * notification à l'avance sans serveur de push : les alertes sont donc envoyées quand
 * l'appli est ouverte ou revient au premier plan. Pour un rappel quotidien fiable,
 * l'appli propose aussi un événement récurrent dans le Calendrier (.ics).
 */

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export async function notify(title: string, body: string, tag?: string): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false;
  const icon = `${import.meta.env.BASE_URL}icons/icon-192.png`;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      await reg.showNotification(title, { body, tag, icon, badge: icon });
      return true;
    }
    new Notification(title, { body, tag, icon });
    return true;
  } catch {
    return false;
  }
}

/** iPhone / iPad (y compris iPadOS qui se présente comme un Mac). */
export function isIOSDevice(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Sur iPhone, Safari et l'appli installée ont des données séparées : un paiement reçu dans Safari ne doit pas y être enregistré. */
export function isIOSSafariTab(): boolean {
  return isIOSDevice() && !isStandalone();
}
