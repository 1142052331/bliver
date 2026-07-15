export interface PlatformCredentialStore {
  getAccessToken(): Promise<string | null>;
  setAccessToken(token: string): Promise<void>;
  clear(): Promise<void>;
}

export const browserCredentialStore: PlatformCredentialStore = {
  async getAccessToken() { return null; },
  async setAccessToken() { /* browser uses HttpOnly cookies */ },
  async clear() { /* browser uses cookie expiry */ },
};

export function createCapacitorCredentialStore(storage: { get: (key: string) => Promise<{ value: string | null }>; set: (entry: { key: string; value: string }) => Promise<void>; remove: (entry: { key: string }) => Promise<void> }): PlatformCredentialStore {
  return {
    async getAccessToken() { return (await storage.get('bliver_access_token')).value; },
    async setAccessToken(token) { await storage.set({ key: 'bliver_access_token', value: token }); },
    async clear() { await storage.remove({ key: 'bliver_access_token' }); },
  };
}
