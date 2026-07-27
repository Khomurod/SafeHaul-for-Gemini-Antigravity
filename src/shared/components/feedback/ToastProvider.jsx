import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((type, message, duration = 4000) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setToasts((prev) => [...prev, { id, type, message }]);

    if (duration) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  const showSuccess = (msg) => addToast('success', msg);
  const showError = (msg) => addToast('error', msg);
  const showInfo = (msg) => addToast('info', msg);
  const showWarning = (msg) => addToast('warning', msg);

  return (
    <ToastContext.Provider value={{ showSuccess, showError, showInfo, showWarning }}>
      {children}

      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`
              pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border animate-in slide-in-from-right-full duration-300
              ${toast.type === 'success' ? 'bg-white border-green-200 text-gray-800' : ''}
              ${toast.type === 'error' ? 'bg-white border-red-200 text-gray-800' : ''}
              ${toast.type === 'info' ? 'bg-white border-blue-200 text-gray-800' : ''}
              ${toast.type === 'warning' ? 'bg-white border-yellow-200 text-gray-800' : ''}
            `}
            role="alert"
          >
            <div className={`
              shrink-0 rounded-full p-1
              ${toast.type === 'success' ? 'text-green-600 bg-green-50' : ''}
              ${toast.type === 'error' ? 'text-red-600 bg-red-50' : ''}
              ${toast.type === 'info' ? 'text-blue-600 bg-blue-50' : ''}
              ${toast.type === 'warning' ? 'text-yellow-600 bg-yellow-50' : ''}
            `}>
              {/* Decorative: the message text and role="alert" carry the meaning. */}
              {toast.type === 'success' && <CheckCircle size={18} aria-hidden="true" />}
              {toast.type === 'error' && <AlertCircle size={18} aria-hidden="true" />}
              {toast.type === 'info' && <Info size={18} aria-hidden="true" />}
              {toast.type === 'warning' && <AlertTriangle size={18} aria-hidden="true" />}
            </div>

            <p className="text-sm font-medium pr-4">{toast.message}</p>

            {/*
              DEFECT FIXED (2026-07-27): this dismiss control had no accessible
              name at all — an icon-only button whose only child was a decorative
              `<X>`. The real-browser axe scan of the public driver application
              reported it as `button-name [critical]`, once per visible toast (the
              guest wizard shows one per upload plus one per submission message).
              It also had no explicit `type`, so inside a form it would submit.

              The hit area was also 16×16 px — the icon's own box — which fails
              WCAG 2.2 AA SC 2.5.8 Target Size (Minimum, 24×24). It is now a
              centred 28 px square.

              Only the accessible name, the decorative icon marking, the button
              type and the hit area changed. This component's visual migration to
              `--ds-*` tokens is its own roadmap row ("Toast/notification") and is
              deliberately NOT bundled here: it is a global surface and an
              app-wide restyle needs its own review.
            */}
            <button
              type="button"
              aria-label={`Dismiss notification: ${toast.message}`}
              onClick={() => removeToast(toast.id)}
              className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
