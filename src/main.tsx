import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { loadLexicon } from './lib/lemmatize';
import './styles/global.css';

registerSW({ immediate: true });

// Warm the full French lexicon in the background (cached after first load) so
// reading lemmatisation is ready by the time the learner opens an article.
void loadLexicon();

// Zoom is disabled app-wide: iOS Safari ignores user-scalable=no in the browser,
// so pinch (gesture* events), ctrl/cmd+wheel and ctrl/cmd+±0 are blocked here too.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
window.addEventListener(
  'wheel',
  (e) => {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
  },
  { passive: false },
);
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '_', '0'].includes(e.key)) e.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
