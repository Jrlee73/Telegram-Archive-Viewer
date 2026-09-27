import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ThemeProvider } from './context/ThemeContext';
import './index.css';

// Handle benign ResizeObserver loop notifications per W3C specification
if (typeof window !== 'undefined') {
  const isResizeObserverError = (msg?: unknown): boolean => {
    if (!msg) return false;
    const str = typeof msg === 'string' ? msg : String((msg as any)?.message || msg);
    return (
      str.includes('ResizeObserver loop completed with undelivered notifications') ||
      str.includes('ResizeObserver loop limit exceeded')
    );
  };

  const origConsoleError = console.error;
  console.error = (...args: any[]) => {
    if (args.some((arg) => isResizeObserverError(arg))) {
      return;
    }
    origConsoleError.apply(console, args);
  };

  window.onerror = (message, source, lineno, colno, error) => {
    if (isResizeObserverError(message) || isResizeObserverError(error)) {
      return true;
    }
  };

  window.addEventListener(
    'error',
    (event: ErrorEvent) => {
      if (isResizeObserverError(event.message) || isResizeObserverError(event.error)) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    },
    true
  );

  window.addEventListener(
    'unhandledrejection',
    (event: PromiseRejectionEvent) => {
      if (isResizeObserverError(event.reason)) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    },
    true
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
