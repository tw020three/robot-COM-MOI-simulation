import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/app.css';

// No <StrictMode>: drei's <Html> labels mount their own React roots, and StrictMode's dev-only
// double mount makes React 19 log "synchronously unmount a root" errors for each label.
createRoot(document.getElementById('root')!).render(<App />);
