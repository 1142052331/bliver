import type { FootprintMediaPreview } from '@bliver/contracts';

export interface MemoryFootprint { id: string; authorId?: string; message?: string; mood?: string | null; publishedAt: string; visibility: string; displayPoint: { lat: number; lng: number }; primaryMedia?: FootprintMediaPreview; }
export interface MemorySummary { footprintCount: number; photoCount: number; visitorCount: number; }
export interface MemoryPage { items: MemoryFootprint[]; nextCursor?: string | null; }
async function request<T>(path: string): Promise<T> { const response = await fetch(`/api/v1${path}`, { credentials: 'include' }); if (!response.ok) throw new Error(`Memory request failed (${response.status})`); return response.json() as Promise<T>; }
export const fetchMemories = (path = '/me'): Promise<{ summary: MemorySummary; map: MemoryFootprint[] }> => request(path);
export const fetchTimeline = (base='/me', cursor?: string): Promise<MemoryPage> => request(`${base}/timeline${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
export const fetchPhotos = (base='/me', cursor?: string): Promise<{ items: { assetId: string; footprintId: string; url: string; createdAt: string }[]; nextCursor?: string | null }> => request(`${base}/photos${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
export const fetchVisitors = (base='/me'): Promise<{ items: { id: string; name: string; visitedAt: string }[] }> => request(`${base}/visitors`);
