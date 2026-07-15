import React, { createContext, useContext, useState, useCallback } from 'react';
import * as Toast from '@radix-ui/react-toast';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type?: 'info' | 'error' | 'success';
}

interface ToastContextType {
  toast: (title: string, description?: string, type?: 'info' | 'error' | 'success') => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const toast = useCallback((title: string, description?: string, type: 'info' | 'error' | 'success' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev.slice(-2), { id, title, description, type }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <Toast.Provider swipeDirection="down">
        {children}
        {toasts.map(({ id, title, description, type }) => (
          <Toast.Root 
            key={id} 
            className={cn(
              "bg-elevated border rounded-xl p-4 shadow-2xl flex items-center justify-between gap-4 animate-in slide-in-from-bottom-full fade-in duration-base",
              type === 'error' ? "border-error/40" : type === 'success' ? "border-success/40" : "border-default"
            )}
            onOpenChange={(open) => {
              if (!open) setToasts((prev) => prev.filter((t) => t.id !== id));
            }}
          >
            <div className="flex flex-col gap-1">
              <Toast.Title className="text-sm font-bold text-primary">{title}</Toast.Title>
              {description && (
                <Toast.Description className="text-xs text-secondary">{description}</Toast.Description>
              )}
            </div>
            <Toast.Close className="p-1 text-tertiary hover:text-primary rounded transition-colors">
              <X size={14} />
            </Toast.Close>
          </Toast.Root>
        ))}
        <Toast.Viewport className="fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-2 w-full max-w-sm z-[200] outline-none" />
      </Toast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}
