import React, { useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type Mail = { id: string; from: string; subject: string; date: string; snippet: string; unread: boolean };
type Detail = Mail & { to: string; body: string };
type Page = { messages: Mail[]; nextPageToken?: string };
async function json<T>(url: string, options?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...options, cache: 'no-store' });
  if (r.status === 401) throw new Error('Sessionen har gått ut. Logga in igen.');
  if (!r.ok) throw new Error('Kunde inte hämta e-post från Gmail.');
  return await r.json() as T;
}
function App() {
  const [authenticated, setAuthenticated] = useState<boolean|null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [gmail, setGmail] = useState<{configured:boolean; connected:boolean}|null>(null);
  const [page, setPage] = useState<Page|null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [currentToken, setCurrentToken] = useState('');
  const [detail, setDetail] = useState<Detail|null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    json<{authenticated:boolean}>('/api/auth/me').then(d => setAuthenticated(d.authenticated))
      .catch(() => { setAuthenticated(false); setError('Servern svarar inte.'); });
  }, []);
  async function loadInbox(token = '') {
    setLoading(true); setError(''); setDetail(null);
    try { setPage(await json<Page>('/api/mail' + (token ? '?pageToken=' + encodeURIComponent(token) : ''))); setCurrentToken(token); }
    catch(e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    if (!authenticated) return;
    json<{configured:boolean;connected:boolean}>('/api/gmail/status')
      .then(d => { setGmail(d); if (d.connected) void loadInbox(); })
      .catch(() => setError('Kunde inte läsa Gmail-status.'));
  }, [authenticated]);
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError('');
    try {
      await json('/api/auth/login', { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password}) });
      setAuthenticated(true);
    } catch { setError('Felaktig inloggning eller för många försök.'); }
    finally { setPassword(''); }
  }
  async function logout() {
    await fetch('/api/auth/logout', {method:'POST'});
    setAuthenticated(false); setGmail(null); setPage(null); setDetail(null); setHistory([]);
  }
  async function connectGmail() {
    try { const data = await json<{url:string}>('/api/auth/google/start',{method:'POST'}); location.assign(data.url); }
    catch { setError('Google OAuth är inte konfigurerat.'); }
  }
  async function openMessage(id: string) {
    setLoading(true);setError('');
    try { setDetail(await json<Detail>('/api/mail/' + encodeURIComponent(id))); }
    catch(e) {setError((e as Error).message);}
    finally {setLoading(false);}
  }
  const next = () => {if (!page?.nextPageToken) return; setHistory(h=>[...h,currentToken]);void loadInbox(page.nextPageToken);};
  const previous = () => {const token = history.at(-1) ?? '';setHistory(h=>h.slice(0,-1));void loadInbox(token);};
  return <main><section className="shell">
    <header><div><small>HOMELAB · WEBMAIL</small><h1>Webbmail</h1></div>{authenticated && <button className="secondary" onClick={logout}>Logga ut</button>}</header>
    {error && <p role="alert" className="warning">{error}</p>}
    {authenticated === null ? <p>Kontrollerar session …</p>
      : !authenticated ? <form onSubmit={login}>
        <label>Användarnamn<input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required /></label>
        <label>Lösenord<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required /></label>
        <button>Logga in</button>
      </form>
      : !gmail?.connected ? <div><p>Gmail är inte anslutet.</p>{gmail?.configured && <button onClick={connectGmail}>Anslut Gmail (endast läsning)</button>}</div>
      : <div className="mail">
        <div className="toolbar"><strong>Inkorgen</strong><button className="secondary" onClick={()=>void loadInbox(currentToken)} disabled={loading}>Uppdatera</button></div>
        {detail ? <article className="message">
          <button className="secondary" onClick={()=>setDetail(null)}>← Tillbaka</button>
          <h2>{detail.subject}</h2><p><strong>Från:</strong> {detail.from}</p><p><strong>Till:</strong> {detail.to}</p>
          <p><strong>Datum:</strong> {detail.date ? new Date(detail.date).toLocaleString('sv-SE') : '–'}</p>
          <pre>{detail.body}</pre>
        </article> : <>
          {loading && <p>Laddar …</p>}
          {!loading && page?.messages.length === 0 && <p>Inkorgen är tom.</p>}
          <div className="messages">{page?.messages.map(m => <button key={m.id} className={'row '+(m.unread?'unread':'')} onClick={()=>void openMessage(m.id)}>
            <span className="from">{m.unread?'● ':''}{m.from}</span><span className="subject">{m.subject}<em> – {m.snippet}</em></span>
            <time>{m.date?new Date(m.date).toLocaleDateString('sv-SE'):''}</time>
          </button>)}</div>
          <div className="pager"><button onClick={previous} disabled={loading||history.length===0}>← Nyare</button>
            <span>Sida {history.length+1}</span><button onClick={next} disabled={loading||!page?.nextPageToken}>Äldre →</button></div>
        </>}
      </div>}
  </section></main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
