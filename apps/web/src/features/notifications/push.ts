function csrf(): string { return document.cookie.split(';').map((part)=>part.trim()).find((part)=>part.startsWith('bliver_csrf='))?.slice('bliver_csrf='.length) ?? ''; }
function decodeKey(value: string): Uint8Array<ArrayBuffer> { const padding='='.repeat((4-value.length%4)%4);const raw=atob((value+padding).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,(character)=>character.charCodeAt(0)); }
export async function enableWebPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  const permission=await Notification.requestPermission(); if(permission!=='granted')return false;
  const keyResponse=await fetch('/api/v1/push/public-key',{credentials:'include'});if(!keyResponse.ok)return false;const {publicKey}=await keyResponse.json() as {publicKey:string};
  const registration=await navigator.serviceWorker.ready;const subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeKey(publicKey)});
  const response=await fetch('/api/v1/push/subscribe',{method:'POST',credentials:'include',headers:{'content-type':'application/json','x-csrf-token':csrf()},body:JSON.stringify(subscription.toJSON())});return response.ok;
}
export async function disableWebPush(): Promise<void> { const registration=await navigator.serviceWorker.ready;const subscription=await registration.pushManager.getSubscription();if(!subscription)return;await fetch('/api/v1/push/unsubscribe',{method:'POST',credentials:'include',headers:{'content-type':'application/json','x-csrf-token':csrf()},body:JSON.stringify({endpoint:subscription.endpoint})});await subscription.unsubscribe(); }

export interface CapacitorPushBridge { requestPermissions(): Promise<{ receive: string }>; register(): Promise<void>; }
export async function enableCapacitorPushFromUserAction(bridge: CapacitorPushBridge): Promise<boolean> { const permission=await bridge.requestPermissions();if(permission.receive!=='granted')return false;await bridge.register();return true; }
