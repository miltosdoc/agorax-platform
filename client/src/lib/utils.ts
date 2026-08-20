import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

type DebounceFunction<T extends (...args: any[]) => any> = {
  (...args: Parameters<T>): void;
  cancel: () => void;
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): DebounceFunction<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const debounced = function(...args: Parameters<T>) {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  } as DebounceFunction<T>;

  debounced.cancel = function() {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return debounced;
}
