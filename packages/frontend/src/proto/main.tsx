import React from 'react';
import ReactDOM from 'react-dom/client';
import Proto from './Proto';

// No StrictMode: it double-mounts, and tldraw's editor + our shape sync are
// both imperative. Prototype — not worth the ceremony of making it idempotent.
ReactDOM.createRoot(document.getElementById('root')!).render(<Proto />);
