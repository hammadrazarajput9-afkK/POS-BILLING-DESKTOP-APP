import './utils/polyfills';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './utils/shareModal';

// Google Maps Platform Tier 1 Quota & Auth Error Listener
(window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};

const origConsoleError = console.error;
console.error = (...args: unknown[]) => {
  origConsoleError.apply(console, args);
  const msg = args.map((a) => String(a)).join(' ');
  if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
};

// Prevent mouse wheel from accidentally changing <input type="number"> values across the entire app
if (typeof window !== 'undefined') {
  window.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement && active.type === 'number') {
        const target = e.target as Node | null;
        if (target === active || (target && active.contains(target))) {
          active.blur();
        }
      }
    },
    { passive: true, capture: true }
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
