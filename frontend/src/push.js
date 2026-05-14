import { apiClient } from './api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return new Uint8Array([...rawData].map((char) => char.charCodeAt(0)));
}

async function getSWRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

export async function subscribeToPush() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    console.log('[Push] Browser does not support push notifications');
    return { success: false, reason: 'unsupported' };
  }

  // Always try to request — even if previously denied.
  // In Capacitor WebView, the native layer may re-show the dialog.
  // In browsers, denied state won't re-prompt (user must reset in settings).
  let permission = Notification.permission;
  if (permission !== 'granted') {
    permission = await Notification.requestPermission();
    console.log('[Push] Notification permission:', permission);
  }
  if (permission !== 'granted') {
    return { success: false, reason: 'denied' };
  }

  const reg = await getSWRegistration();
  if (!reg) {
    console.log('[Push] Service worker registration failed');
    return { success: false, reason: 'sw_failed' };
  }
  console.log('[Push] Service worker registered:', reg.scope);

  // Get VAPID public key
  const { data: { publicKey } } = await apiClient.push.vapidKey();
  console.log('[Push] Got VAPID public key');

  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    console.log('[Push] Creating new subscription...');
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  // Send subscription to backend
  await apiClient.push.subscribe(subscription.toJSON());
  console.log('[Push] Subscription saved to backend');

  return { success: true };
}

export async function unsubscribeFromPush() {
  const reg = await getSWRegistration();
  if (!reg) return;
  const subscription = await reg.pushManager.getSubscription();
  if (subscription) {
    await apiClient.push.unsubscribe({ endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  }
}

export function isPushSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

export function getPermissionState() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}
