import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
function App(){return <main><article><small>HOMELAB · WEBMAIL</small><h1>Din privata webbmail</h1><p>Docker och webbgränssnitt är på plats. Lokal inloggning och Gmail API tillkommer i senare sprintar.</p><p className="warning">Ingen inloggning är aktiverad ännu. Exponera inte tjänsten på nätverket.</p><a href="/api/health">Kontrollera API-status →</a></article></main>};
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
