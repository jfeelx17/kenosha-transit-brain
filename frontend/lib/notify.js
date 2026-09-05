// Foreground alerts: vibration plus a notification through the service worker.
// Works on Android Chrome and on iOS 16.4+ when the app is installed to the
// home screen. Everything is guarded so unsupported browsers just do nothing.

export function notificationsSupported() {
  return typeof window !== 'undefined' && typeof Notification !== 'undefined';
}

/** 'granted' | 'denied' | 'default' | 'unsupported' */
export function permissionState() {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission;
}

/** Must be called from a user gesture (tap) on iOS. */
export async function requestPermission() {
  if (!notificationsSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function vibrate(pattern = [250, 120, 250]) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

/** Show a notification. Prefers the service worker (required on iOS); falls back to the page API. */
export async function notify(title, { body = '', tag = 'kenosha-loop' } = {}) {
  if (permissionState() !== 'granted') return false;
  const options = { body, tag, renotify: true, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', vibrate: [250, 120, 250] };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg && typeof reg.showNotification === 'function') {
      await reg.showNotification(title, options);
      return true;
    }
  } catch {
    // fall through to the page API
  }
  try {
    // eslint-disable-next-line no-new
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}
