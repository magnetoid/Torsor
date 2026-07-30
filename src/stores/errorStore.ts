import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { migratePersistKey } from '../lib/utils';

// Legacy persist key rename (pre-rebrand residue): tesseract-* -> torsor-*.
migratePersistKey('tesseract-errors', 'torsor-errors');

export interface AppError {
  id: string;
  type: 'TypeError' | 'Build Error' | 'Runtime Error' | 'Auth Error';
  message: string;
  file: string;
  line: number;
  stack: string;
  timestamp: number;
  status: 'detected' | 'fixing' | 'fixed' | 'ignored';
  explanation?: string;
  fixDiff?: {
    removed: string;
    added: string;
  };
}

interface ErrorState {
  errors: AppError[];
  isDebugMode: boolean;
  
  // Actions
  addError: (error: Omit<AppError, 'id' | 'timestamp' | 'status'>) => void;
  fixError: (id: string, explanation: string, diff: AppError['fixDiff']) => void;
  ignoreError: (id: string) => void;
  setDebugMode: (enabled: boolean) => void;
  clearErrors: () => void;
}

export const useErrorStore = create<ErrorState>()(
  persist(
    (set) => ({
      errors: [],
      isDebugMode: false,

      addError: (error) => set((state) => ({
        errors: [
          {
            ...error,
            id: Math.random().toString(36).substring(7),
            timestamp: Date.now(),
            status: 'detected'
          },
          ...state.errors
        ]
      })),

      fixError: (id, explanation, diff) => set((state) => ({
        errors: state.errors.map(err => 
          err.id === id ? { ...err, status: 'fixed', explanation, fixDiff: diff } : err
        )
      })),

      ignoreError: (id) => set((state) => ({
        errors: state.errors.map(err => 
          err.id === id ? { ...err, status: 'ignored' } : err
        )
      })),

      setDebugMode: (isDebugMode) => set({ isDebugMode }),
      
      clearErrors: () => set({ errors: [] }),
    }),
    {
      name: 'torsor-errors',
    }
  )
);
