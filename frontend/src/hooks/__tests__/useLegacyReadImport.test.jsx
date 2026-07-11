import { StrictMode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useLegacyReadImport from '../useLegacyReadImport';

const mocks = vi.hoisted(() => ({ importReadState: vi.fn() }));

vi.mock('../../api', () => ({
  apiClient: { footprints: { importReadState: mocks.importReadState } },
}));

const legacyKey = (userId) => `bliver_read_${userId}`;
const importedKey = (userId) => `bliver_read_imported_v1_${userId}`;

describe('useLegacyReadImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.importReadState.mockResolvedValue({ data: { imported: 0, skipped: 0 } });
  });

  it('imports only the 500 newest valid legacy entries once', async () => {
    const userId = 'user-1';
    const readMap = Object.fromEntries(
      Array.from({ length: 502 }, (_, index) => [
        String(index).padStart(24, '0'),
        index + 1,
      ]),
    );
    readMap.invalid = 'not-a-date';
    localStorage.setItem(legacyKey(userId), JSON.stringify(readMap));

    renderHook(() => useLegacyReadImport(userId), { wrapper: StrictMode });

    await waitFor(() => expect(mocks.importReadState).toHaveBeenCalledTimes(1));
    const entries = mocks.importReadState.mock.calls[0][0];
    expect(entries).toHaveLength(500);
    expect(entries[0]).toEqual({ footprintId: String(501).padStart(24, '0'), readAt: 502 });
    expect(entries.at(-1)).toEqual({ footprintId: String(2).padStart(24, '0'), readAt: 3 });
    await waitFor(() => expect(localStorage.getItem(importedKey(userId))).toBe('1'));
  });

  it('records completion only after a successful import', async () => {
    const userId = 'user-2';
    localStorage.setItem(legacyKey(userId), JSON.stringify({
      '000000000000000000000001': 100,
    }));
    mocks.importReadState.mockRejectedValueOnce(new Error('offline'));

    renderHook(() => useLegacyReadImport(userId));

    await waitFor(() => expect(mocks.importReadState).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem(importedKey(userId))).toBeNull();
  });

  it('skips guests and users whose import is already complete', async () => {
    renderHook(() => useLegacyReadImport(null));
    localStorage.setItem(importedKey('user-3'), '1');
    renderHook(() => useLegacyReadImport('user-3'));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.importReadState).not.toHaveBeenCalled();
  });
});
