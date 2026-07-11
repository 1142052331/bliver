import { useEffect } from 'react';
import { apiClient } from '../api';
import { getLegacyReadEntries } from '../readStatus';

const pendingImports = new Map();

function importedKey(userId) {
  return `bliver_read_imported_v1_${userId}`;
}

export default function useLegacyReadImport(userId) {
  useEffect(() => {
    if (!userId || localStorage.getItem(importedKey(userId)) === '1') return;
    if (pendingImports.has(userId)) return;

    const request = apiClient.footprints
      .importReadState(getLegacyReadEntries(userId))
      .then(() => {
        localStorage.setItem(importedKey(userId), '1');
      })
      .catch(() => {})
      .finally(() => {
        pendingImports.delete(userId);
      });
    pendingImports.set(userId, request);
  }, [userId]);
}
