export type DeepLink =
  | { readonly kind: 'footprint'; readonly id: string; readonly path: string }
  | { readonly kind: 'conversation'; readonly id: string; readonly path: string };

export function parseDeepLink(value: string): DeepLink | null {
  let pathname: string;
  try { pathname = new URL(value, 'https://bliver.local').pathname; } catch { return null; }
  const footprint = pathname.match(/^\/footprints\/([^/]+)$/);
  if (footprint?.[1]) return { kind: 'footprint', id: decodeURIComponent(footprint[1]), path: pathname };
  const conversation = pathname.match(/^\/messages\/([^/]+)$/);
  if (conversation?.[1]) return { kind: 'conversation', id: decodeURIComponent(conversation[1]), path: pathname };
  return null;
}

export function deepLinkDestination(value: string, authenticated: boolean): string | null {
  const link = parseDeepLink(value);
  if (!link) return null;
  return authenticated ? link.path : `/login?returnTo=${encodeURIComponent(link.path)}`;
}

function internalReturnTo(value: string | null | undefined): string | null {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  const url = new URL(value, 'https://bliver.local');
  return url.origin === 'https://bliver.local' ? `${url.pathname}${url.search}${url.hash}` : null;
}

export function loginReturnDestination(search: string, stateFrom?: string): string {
  const returnTo = new URLSearchParams(search).get('returnTo');
  return internalReturnTo(returnTo) ?? internalReturnTo(stateFrom) ?? '/map';
}
