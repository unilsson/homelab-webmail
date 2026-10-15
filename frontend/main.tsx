import React, { useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { fetch('/api/auth/me', { cache: 'no-store' }).then(r => r.json()).then(data => setAuthenticated(data.authenticated)).catch(() => setError('Servern svarar inte')); }, []);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      setPassword('');
      if (!response.ok) { setError(response.status === 429 ? 'För många försök. Försök senare.' : 'Fel användarnamn eller lösenord.'); return; }
      setAuthenticated(true);
    } catch { setError('Anslutningen misslyckades'); }
  }
  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); setAuthenticated(false); }
  return <main><article><small>HOMELAB · WEBMAIL</small><h1>Din privata webbmail</h1>
    {authenticated === null ? <p>Kontrollerar session …</p> : authenticated ? <>
      <p>Du är inloggad lokalt. Gmail ansluts i Sprint 3.</p>
      <button onClick={logout}>Logga ut</button>
    </> : <form onSubmit={login}>
      <label>Användarnamn<input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required /></label>
      <label>Lösenord<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
      <button type="submit">Logga in</button>
    </form>}
    {error && <p role="alert" className="warning">{error}</p>}
  </article></main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
