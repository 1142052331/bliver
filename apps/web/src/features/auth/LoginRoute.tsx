import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Surface } from '@bliver/ui';
import type { LoginRequest } from '@bliver/contracts';
import { authApi } from './api.js';
import { consumePendingAction } from '../../platform/pending-action.js';
import { loginReturnDestination } from '../../platform/deep-link.js';
import './auth.css';
export function LoginRoute() { const navigate = useNavigate(); const location = useLocation(); const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const submit = async (): Promise<void> => { const input: LoginRequest = { username, password, platform: 'web' }; try { await authApi.login(input); const pending = consumePendingAction(); const stateFrom = typeof location.state?.from === 'string' ? location.state.from : undefined; const destination = pending?.returnTo ?? loginReturnDestination(location.search, stateFrom); navigate(destination, { replace: true, ...(pending ? { state: { pendingAction: pending } } : {}) }); } catch { setError('Sign in failed. Check your details and try again.'); } }; return <section className="auth-route"><Surface><h1>Sign in</h1>{error ? <p role="alert">{error}</p> : null}<label>Username<input aria-label="Username" value={username} onChange={(event) => setUsername(event.target.value)} /></label><label>Password<input aria-label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><Button onClick={() => void submit()} disabled={!username || !password}>Sign in</Button></Surface></section>; }
