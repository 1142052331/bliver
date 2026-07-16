export interface FootprintDraft {
  readonly message: string;
  readonly visibility: 'public' | 'friends' | 'private';
  readonly locationPrecision: 'precise' | 'approximate';
}

const DRAFT_KEY = 'bliver:footprint-draft';

export function saveFootprintDraft(draft: FootprintDraft): void {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function loadFootprintDraft(): FootprintDraft | null {
  try {
    const value = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as Partial<FootprintDraft> | null;
    if (!value || typeof value.message !== 'string' || !['public', 'friends', 'private'].includes(value.visibility ?? '') || !['precise', 'approximate'].includes(value.locationPrecision ?? '')) return null;
    return { message: value.message, visibility: value.visibility as FootprintDraft['visibility'], locationPrecision: value.locationPrecision as FootprintDraft['locationPrecision'] };
  } catch { return null; }
}

export function clearFootprintDraft(): void { localStorage.removeItem(DRAFT_KEY); }
