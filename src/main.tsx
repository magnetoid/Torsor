import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { installClientLogging } from './lib/logger';

// Capture uncaught errors and unhandled rejections before the app renders, so a crash during
// the very first render is reported rather than lost.
installClientLogging();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
