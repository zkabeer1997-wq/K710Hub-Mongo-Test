'use client';

// Global toast/notification system. ToastProvider mounts a fixed-position
// portal container once (in app/layout.js, inside <body>); useToast() gives
// any client component a toast(message, { type }) function plus success/
// error/info shorthands. Deliberately additive and console-dark by default
// (the shell it mounts into is .theme-console) - reads --color-* / legacy
// tokens from app/tokens.css rather than introducing a new palette.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const ToastContext = createContext(null);

const DEFAULT_DURATION = 5000;
let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback((message, options = {}) => {
    if (!message) return null;
    const { type = 'info', duration = DEFAULT_DURATION } = options;
    const id = nextId++;
    setToasts((current) => [...current, { id, message, type }]);
    if (duration > 0) {
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    }
    return id;
  }, [dismiss]);

  const api = useMemo(() => ({
    toast,
    success: (message, options) => toast(message, { ...options, type: 'success' }),
    error: (message, options) => toast(message, { ...options, type: 'error' }),
    info: (message, options) => toast(message, { ...options, type: 'info' }),
    dismiss,
  }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toasts, onDismiss }) {
  // Render nothing until after mount so the server pass and the client's first
  // (hydration) render match exactly — the portal only exists client-side, and
  // creating it during hydration triggered a tree mismatch warning.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === 'undefined') return null;

  const politeToasts = toasts.filter((t) => t.type !== 'error');
  const assertiveToasts = toasts.filter((t) => t.type === 'error');

  return createPortal(
    <div className="ui-toast-viewport">
      <div className="ui-toast-stack" aria-live="polite" aria-atomic="false">
        {politeToasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
        ))}
      </div>
      <div className="ui-toast-stack" aria-live="assertive" aria-atomic="false">
        {assertiveToasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
        ))}
      </div>
    </div>,
    document.body,
  );
}

function ToastItem({ toast, onDismiss }) {
  return (
    <div className={`ui-toast ui-toast-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
      <span className="ui-toast-icon" aria-hidden="true">
        {toast.type === 'success' ? '✓' : toast.type === 'error' ? '⚠' : 'ℹ'}
      </span>
      <span className="ui-toast-message">{toast.message}</span>
      <button
        type="button"
        className="ui-toast-close"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
      >
        &times;
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
