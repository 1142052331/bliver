import { useState } from 'react';
import { useLoginCommand, useRegisterCommand } from '../commands.js';

export function AuthPanel() {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const login = useLoginCommand(); const register = useRegisterCommand();
  return <form onSubmit={(event) => { event.preventDefault(); login.mutate({ username, password, platform: 'web' }); }} aria-label="Sign in">
    <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
    <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
    <button type="submit" disabled={login.isPending}>Sign in</button>
    <button type="button" disabled={register.isPending} onClick={() => register.mutate({ username, password })}>Create account</button>
    {login.isError ? <p role="alert">Unable to sign in</p> : null}
  </form>;
}
