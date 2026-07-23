// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  return render(
    <BliverI18nProvider instance={createBliverI18n('en')}>
      <MemoryRouter initialEntries={[path]}>
        <LoginRoute />
      </MemoryRouter>
    </BliverI18nProvider>,
  );
}

describe('LoginRoute registration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exposes a registration page from the sign-in flow', () => {
    renderRoute('/login');

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    const registerLink = screen.getByRole('link', { name: 'Create account' });
    expect(registerLink).toHaveAttribute('href', '/register?returnTo=%2Fmap');
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
    });
    renderRoute('/register?returnTo=%2Fmessages');

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
