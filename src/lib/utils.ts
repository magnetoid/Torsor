import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDistanceToNow(date: string | Date) {
  const now = new Date();
  const then = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (diffInSeconds < 60) return 'just now';
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays}d ago`;
  const diffInMonths = Math.floor(diffInDays / 30);
  return `${diffInMonths}mo ago`;
}

/**
 * One-time localStorage key rename for zustand persist stores (legacy `tesseract-*`
 * → `torsor-*`). Copies the old value to the new key if the new key is empty, then
 * removes the old key. Call before the store is created so hydration sees the data.
 */
export function migratePersistKey(oldKey: string, newKey: string) {
  try {
    const old = localStorage.getItem(oldKey);
    if (old !== null) {
      if (localStorage.getItem(newKey) === null) localStorage.setItem(newKey, old);
      localStorage.removeItem(oldKey);
    }
  } catch {
    // Storage unavailable (SSR/private mode) — nothing to migrate.
  }
}
