export function csrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const value = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('bliver_csrf='));
  return value ? decodeURIComponent(value.slice('bliver_csrf='.length)) : undefined;
}

export function mutationHeaders(headers: Record<string, string>): Record<string, string> {
  const token = csrfToken();
  return token ? { ...headers, 'x-csrf-token': token } : headers;
}
