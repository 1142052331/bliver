// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BliverI18nProvider } from '../../../i18n/I18nProvider.js';
import { createBliverI18n } from '../../../i18n/i18n.js';
import { LoginRoute } from '../LoginRoute.js';
import { authApi } from '../api.js';

vi.mock('../api.js', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
  },
}));

function renderRoute(path = '/register') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <BliverI18nProvider instance={createBliverI18n('en')}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <LoginRoute />
        </MemoryRouter>
      </QueryClientProvider>
    </BliverI18nProvider>,
  );
  return { ...view, queryClient };
}

describe('LoginRoute registration', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('exposes a registration page from the sign-in flow', () => {
    renderRoute('/login');

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    const registerLink = screen.getByRole('link', { name: 'Create account' });
    expect(registerLink).toHaveAttribute('href', '/register?returnTo=%2Fmap');
  });

  it('renders the account-required scene without text over the city image', () => {
    renderRoute('/auth-required?returnTo=%2Fmessages');

    expect(screen.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible();
    expect(
      screen.getByText(
        'Messages is connected to your account. Sign in and Bliver will bring you back here.',
      ),
    ).toBeVisible();
    expect(screen.queryByText('Your world, remembered by place.')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue to sign in' })).toHaveAttribute(
      'href',
      '/login?returnTo=%2Fmessages',
    );
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute(
      'href',
      '/register?returnTo=%2Fmessages',
    );
    expect(screen.getByRole('link', { name: 'Explore the map first' })).toHaveAttribute(
      'href',
      '/map',
    );
    expect(document.querySelector('.auth-route__memory-media')).toHaveAttribute(
      'src',
      '/images/login-city.webp',
    );
  });

  it('submits the registration contract and keeps the return destination', async () => {
    vi.mocked(authApi.register).mockResolvedValueOnce({
      user: {
        id: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b70',
        username: 'alice',
        displayName: 'Alice',
        email: null,
        roles: ['user'],
      },
      session: {
        id: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b71',
        deviceName: 'Web',
        createdAt: '2026-01-01T00:00:00.000Z',
        lastSeenAt: '2026-01-01T00:00:00.000Z',
        current: true,
      },
    });
    const { queryClient } = renderRoute('/register?returnTo=%2Fmessages');

    fireEvent.change(screen.getByRole('textbox', { name: 'Username' }), { target: { value: 'alice' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Display name' }), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'strong-pass' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'strong-pass' } });
    expect(screen.getByRole('textbox', { name: 'Username' })).toHaveValue('alice');
    expect(screen.getByLabelText('Password')).toHaveValue('strong-pass');
    expect(screen.getByLabelText('Confirm password')).toHaveValue('strong-pass');
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form')!);

    await vi.waitFor(() => expect(authApi.register).toHaveBeenCalledWith({
      username: 'alice',
      password: 'strong-pass',
      displayName: 'Alice',
    }));
    expect(queryClient.getQueryData(['auth', 'session'])).toMatchObject({ current: true });
  });

  it('rejects mismatched passwords without calling the API', () => {
    renderRoute();

    fireEvent.change(screen.getByRole('textbox', { name: 'Username' }), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'strong-pass' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'different-pass' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form')!);

    expect(authApi.register).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('The passwords do not match.');
  });
});
