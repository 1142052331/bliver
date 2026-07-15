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
