import { describe, expect, it } from 'vitest';
import { parseDeepLink } from '../deep-link.js';

describe('Capacitor deep links', () => {
  it('maps footprint and conversation links into typed destinations', () => {
    expect(parseDeepLink('bliver://app/footprints/footprint-1')).toEqual({ kind: 'footprint', id: 'footprint-1', path: '/footprints/footprint-1' });
    expect(parseDeepLink('https://bliver.app/footprints/footprint-1')).toEqual({ kind: 'footprint', id: 'footprint-1', path: '/footprints/footprint-1' });
    expect(parseDeepLink('/messages/conversation-1')).toEqual({ kind: 'conversation', id: 'conversation-1', path: '/messages/conversation-1' });
  });
});
