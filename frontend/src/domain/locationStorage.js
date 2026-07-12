const SCOPE_KEY = 'bliver_map_scope_v1';

function normalizeFixedScope(value) {
  if (!value || !['region', 'country', 'global'].includes(value.scope)) return null;
  if (value.scope === 'region' && !value.regionCode) return null;
  if (value.scope === 'country' && !value.countryCode) return null;
  const result = { scope: value.scope };
  for (const key of ['countryCode', 'countryName', 'regionCode', 'regionName']) {
    if (typeof value[key] === 'string' && value[key]) result[key] = value[key];
  }
  return result;
}

export function loadFixedScope() {
  try {
    return normalizeFixedScope(JSON.parse(localStorage.getItem(SCOPE_KEY)));
  } catch {
    return null;
  }
}

export function saveFixedScope(value) {
  const normalized = normalizeFixedScope(value);
  if (normalized) localStorage.setItem(SCOPE_KEY, JSON.stringify(normalized));
  else localStorage.removeItem(SCOPE_KEY);
}
