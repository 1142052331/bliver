export interface MemoryFootprint { id: string; message?: string; publishedAt: string; visibility: string; displayPoint: { lat: number; lng: number }; }
export interface MemorySummary { footprintCount: number; photoCount: number; visitorCount: number; }
export interface MemoryPage { items: MemoryFootprint[]; nextCursor?: string | null; }
async function request<T>(path: string): Promise<T> { const response = await fetch(`/api/v1${path}`, { credentials: 'include' }); if (!response.ok) throw new Error(`Memory request failed (${response.status})`); return response.json() as Promise<T>; }
export const fetchMemories = (path = '/me'): Promise<{ summary: MemorySummary; map: MemoryFootprint[] }> => request(path);
export const fetchTimeline = (cursor?: string): Promise<MemoryPage> => request(`/me/timeline${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
export const fetchPhotos = (cursor?: string): Promise<{ items: { assetId: string; footprintId: string; url: string; createdAt: string }[]; nextCursor?: string | null }> => request(`/me/photos${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
export const fetchVisitors = (): Promise<{ items: { id: string; name: string; visitedAt: string }[] }> => request('/me/visitors');
