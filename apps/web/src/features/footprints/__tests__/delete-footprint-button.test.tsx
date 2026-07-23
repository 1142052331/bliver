// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BliverI18nProvider } from '../../../i18n/I18nProvider.js';
import { createBliverI18n } from '../../../i18n/i18n.js';
import { DeleteFootprintButton } from '../DeleteFootprintButton.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DeleteFootprintButton', () => {
  it('requires confirmation before deleting', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('confirm', vi.fn(() => false));

    render(
      <QueryClientProvider client={new QueryClient()}>
        <BliverI18nProvider instance={createBliverI18n('en')}>
          <DeleteFootprintButton footprintId="019f0000-0000-7000-8000-000000000002" />
        </BliverI18nProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete footprint' }));
    expect(fetchMock).not.toHaveBeenCalled();

    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Delete footprint' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  });
});
