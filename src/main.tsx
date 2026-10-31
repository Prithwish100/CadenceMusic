import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register our custom Network-First + Now Playing Service Worker on web (skip in native APK where assets are local)
if (
  'serviceWorker' in navigator &&
  window.location.hostname !== 'cadence.local' &&
  !navigator.userAgent.includes('CadenceAPK')
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        reg.update().catch(() => {});
      })
      .catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(<App />);
