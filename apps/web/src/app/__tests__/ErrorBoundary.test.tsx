// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppErrorBoundary } from '../ErrorBoundary.js';
import { BliverI18nProvider } from '../../i18n/I18nProvider.js';
import { createBliverI18n } from '../../i18n/i18n.js';

function BrokenRoute(): never {
  throw new Error('test route failure');
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AppErrorBoundary', () => {
  it('contains failures in the active locale', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <BliverI18nProvider instance={createBliverI18n('ja')}>
        <AppErrorBoundary>
          <BrokenRoute />
        </AppErrorBoundary>
      </BliverI18nProvider>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('アプリを続行できません');
    expect(
      screen.getByRole('button', { name: 'もう一度試す' }),
    ).toBeVisible();
  });
});
