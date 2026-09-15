import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SessionProvider } from './auth/session';
import { registerServiceWorker } from './pwa/registerServiceWorker';
import './styles/global.css';
import './styles/board.css';
import './styles/effects.css';
import './styles/clock.css';
import './styles/art.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

registerServiceWorker();

createRoot(root).render(
  <StrictMode>
    <SessionProvider>
      <App />
    </SessionProvider>
  </StrictMode>,
);
