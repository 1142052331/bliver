export interface PlaceResult { readonly id: string; readonly name: string; readonly lat: number; readonly lng: number; readonly countryCode?: string; }
export interface GeographyPorts { geocode(input: { readonly latitude: number; readonly longitude: number }): Promise<{ readonly place: PlaceResult | null; readonly region: { readonly id: string; readonly name: string } | null }>; searchPlaces(query: string): Promise<ReadonlyArray<PlaceResult>>; weather(input: { readonly latitude: number; readonly longitude: number }): Promise<Record<string, unknown> | null>; }
export interface GeographyProviderOptions { readonly fetch?: typeof fetch; readonly timeoutMs?: number; readonly baseUrl?: string; readonly observe?: (healthy: boolean) => void; }

async function bounded<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([task, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('provider timeout')), timeoutMs))]);
}

function safeProviderBaseUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('unsafe provider URL'); }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const ipv4 = hostname.split('.').map(Number);
  const privateIpv4 = ipv4.length === 4 && ipv4.every(Number.isInteger) && (
    ipv4[0] === 10 || ipv4[0] === 127 ||
    (ipv4[0] === 169 && ipv4[1] === 254) ||
    (ipv4[0] === 172 && (ipv4[1] ?? 0) >= 16 && (ipv4[1] ?? 0) <= 31) ||
    (ipv4[0] === 192 && ipv4[1] === 168)
  );
  const privateIpv6 = hostname === '::1' || /^(?:fc|fd|fe8|fe9|fea|feb)/i.test(hostname);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || privateIpv4 || privateIpv6) throw new Error('unsafe provider URL');
  return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
}

export function createNominatimGeography(options: GeographyProviderOptions = {}): GeographyPorts {
  const fetcher = options.fetch ?? fetch;
  const timeout = options.timeoutMs ?? 2_000;
  const base = safeProviderBaseUrl(options.baseUrl ?? 'https://nominatim.openstreetmap.org');
  return {
    async geocode(input) {
      try {
        const response = await bounded(fetcher(`${base}/reverse?format=jsonv2&lat=${input.latitude}&lon=${input.longitude}`, { headers: { 'user-agent': 'bliver-v2/1.0' } }), timeout);
        if (!response.ok) { options.observe?.(false); return { place: null, region: null }; }
        const body = await response.json() as { place_id?: number; display_name?: string; lat?: string; lon?: string; address?: { country_code?: string; state?: string } };
        options.observe?.(true);
        return { place: body.place_id && body.display_name && body.lat && body.lon ? { id: String(body.place_id), name: body.display_name, lat: Number(body.lat), lng: Number(body.lon), ...(body.address?.country_code ? { countryCode: body.address.country_code.toUpperCase() } : {}) } : null, region: body.address?.state ? { id: body.address.state, name: body.address.state } : null };
      } catch { options.observe?.(false); return { place: null, region: null }; }
    },
    async searchPlaces(query) {
      try {
        const response = await bounded(fetcher(`${base}/search?format=jsonv2&limit=8&q=${encodeURIComponent(query)}`, { headers: { 'user-agent': 'bliver-v2/1.0' } }), timeout);
        if (!response.ok) { options.observe?.(false); return []; }
        const rows = await response.json() as Array<{ place_id?: number; display_name?: string; lat?: string; lon?: string }>;
        options.observe?.(true);
        return rows.flatMap((row) => row.place_id && row.display_name && row.lat && row.lon ? [{ id: String(row.place_id), name: row.display_name, lat: Number(row.lat), lng: Number(row.lon) }] : []);
      } catch { options.observe?.(false); return []; }
    },
    async weather() { return null; },
  };
}
