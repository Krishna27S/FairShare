'use client';

import { useState, useEffect } from 'react';
import { toastManager, Toast } from '@/lib/toast';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

const getToastStyles = (type: string) => {
  switch (type) {
    case 'success':
      return {
        bg: 'bg-success/20',
        border: 'border-success/30',
        text: 'text-success',
        icon: <CheckCircle size={20} />,
      };
    case 'error':
      return {
        bg: 'bg-destructive/20',
        border: 'border-destructive/30',
        text: 'text-destructive',
        icon: <AlertCircle size={20} />,
      };
    case 'warning':
      return {
        bg: 'bg-amber-500/20',
        border: 'border-amber-500/30',
        text: 'text-amber-600',
        icon: <AlertTriangle size={20} />,
      };
    case 'info':
      return {
        bg: 'bg-blue-500/20',
        border: 'border-blue-500/30',
        text: 'text-blue-600',
        icon: <Info size={20} />,
      };
    default:
      return {
        bg: 'bg-muted',
        border: 'border-border',
        text: 'text-foreground',
        icon: <Info size={20} />,
      };
  }
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const unsubscribe = toastManager.subscribe(setToasts);
    return unsubscribe;
  }, []);

  return (
    <div className="fixed top-4 right-4 z-[9999] space-y-2 pointer-events-none">
      {toasts.map((toast) => {
        const styles = getToastStyles(toast.type);
        return (
          <div
            key={toast.id}
            className={`${styles.bg} ${styles.border} ${styles.text} border rounded-lg p-4 flex items-start gap-3 max-w-md animate-in slide-in-from-top pointer-events-auto`}
          >
            <div className="flex-shrink-0 mt-0.5">{styles.icon}</div>
            <p className="text-sm font-medium flex-1">{toast.message}</p>
            <button
              onClick={() => toastManager.dismiss(toast.id)}
              className="flex-shrink-0 hover:opacity-70 transition"
            >
              <X size={18} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
