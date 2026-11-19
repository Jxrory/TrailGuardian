import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

const NotificationContext = createContext(null);

const TOAST_STYLES = {
  success: 'border-emerald-700 bg-emerald-950/95 text-emerald-100',
  error: 'border-rose-700 bg-rose-950/95 text-rose-100',
  info: 'border-slate-700 bg-slate-900/95 text-slate-100',
};

const TOAST_ICONS = {
  success: 'fa-circle-check text-emerald-400',
  error: 'fa-circle-exclamation text-rose-400',
  info: 'fa-circle-info text-emerald-400',
};

export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message, type = 'info', duration = 3200) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setToasts((current) => [...current.slice(-4), { id, message, type }]);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const contextValue = useMemo(() => ({ notify }), [notify]);

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      <div className="pointer-events-none fixed left-1/2 top-12 z-[9999] flex w-11/12 max-w-sm -translate-x-1/2 flex-col gap-2">
        {toasts.map((toast) => (
          <div
            className={`toast-enter pointer-events-auto flex items-center gap-2.5 rounded-xl border px-4 py-3 text-xs font-medium shadow-xl backdrop-blur ${TOAST_STYLES[toast.type] ?? TOAST_STYLES.info}`}
            key={toast.id}
            role="status"
          >
            <i className={`fa-solid ${TOAST_ICONS[toast.type] ?? TOAST_ICONS.info}`} />
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used inside NotificationProvider');
  }
  return context;
}
