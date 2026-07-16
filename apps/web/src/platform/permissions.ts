export interface NativePermissionBridge {
  request(capability: 'camera' | 'location'): Promise<{ state: 'granted' | 'denied' | 'prompt' }>;
}

export async function requestNativePermission(bridge: NativePermissionBridge, capability: 'camera' | 'location'): Promise<boolean> {
  try { return (await bridge.request(capability)).state === 'granted'; }
  catch { return false; }
}
