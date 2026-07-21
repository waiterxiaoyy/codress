import { createContext, useCallback, useContext, useEffect, useState } from "react";

interface ToastState {
  text: string;
  error: boolean;
}

const ToastContext = createContext<(text: string, error?: boolean) => void>(() => undefined);

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const show = useCallback((text: string, error = false) => {
    setToast({ text, error });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.error ? 5200 : 2600);
    return () => clearTimeout(timer);
  }, [toast]);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && <div className={`toast ${toast.error ? "err" : ""}`}>{toast.text}</div>}
    </ToastContext.Provider>
  );
}
