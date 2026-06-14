import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './i18n';
import { TooltipProvider } from './components/ui/tooltip';
import ErrorBoundary from './components/ErrorBoundary';

// Tailwind CSS
import './index.css';

// Custom styles (scrollbar, splash, BlockNote overrides)
import './styles/custom.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <TooltipProvider delayDuration={300}>
        <App />
      </TooltipProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
