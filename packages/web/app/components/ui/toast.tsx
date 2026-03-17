/**
 * Toast Notification System
 *
 * A flexible toast notification system with:
 * - Multiple types (success, error, warning, info)
 * - Customizable duration
 * - Dismissible notifications
 * - Action buttons
 * - Stacking support
 */

import {
  createContext,
  useContext,
  useCallback,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

// Types
export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  dismissible?: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface ToastOptions extends Omit<Toast, "id"> {}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (options: ToastOptions) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Toast icons
const icons: Record<ToastType, ReactNode> = {
  success: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  error: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  warning: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  ),
  info: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
};

const iconColors: Record<ToastType, string> = {
  success: "text-success-500",
  error: "text-error-500",
  warning: "text-warning-500",
  info: "text-primary-500",
};

const borderColors: Record<ToastType, string> = {
  success: "border-l-success-500",
  error: "border-l-error-500",
  warning: "border-l-warning-500",
  info: "border-l-primary-500",
};

// Default durations
const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 4000,
  error: 6000,
  warning: 5000,
  info: 4000,
};

// Generate unique ID
function generateId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Toast Provider
 */
interface ToastProviderProps {
  children: ReactNode;
  maxToasts?: number;
}

export function ToastProvider({ children, maxToasts = 5 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (options: ToastOptions): string => {
      const id = generateId();
      const duration = options.duration ?? DEFAULT_DURATION[options.type];

      const toast: Toast = {
        ...options,
        id,
        duration,
        dismissible: options.dismissible ?? true,
      };

      setToasts((prev) => {
        const newToasts = [toast, ...prev];
        // Limit number of toasts
        return newToasts.slice(0, maxToasts);
      });

      // Auto-dismiss after duration
      if (duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
      }

      return id;
    },
    [maxToasts]
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, clearToasts }}>
      {children}
    </ToastContext.Provider>
  );
}

/**
 * Toast Viewport - renders toasts
 */
export function ToastViewport() {
  const context = useContext(ToastContext);
  if (!context) return null;

  const { toasts, removeToast } = context;

  if (typeof document === "undefined") return null;
  if (toasts.length === 0) return null;

  return createPortal(
    <div
      className="fixed right-4 top-4 z-50 flex flex-col gap-2"
      role="log"
      aria-label="Notifications"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
      ))}
    </div>,
    document.body
  );
}

/**
 * Individual Toast Item
 */
interface ToastItemProps {
  toast: Toast;
  onDismiss: () => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  return (
    <div
      className={cn(
        "flex w-80 items-start gap-3 rounded-lg border-l-4 bg-white p-4 shadow-lg",
        "animate-in slide-in-from-right-full fade-in duration-300",
        "dark:bg-gray-800",
        borderColors[toast.type]
      )}
      role="status"
      aria-atomic="true"
    >
      <span className={cn("shrink-0", iconColors[toast.type])} aria-hidden="true">
        {icons[toast.type]}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          {toast.title}
        </p>
        {toast.message && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {toast.message}
          </p>
        )}
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick();
              onDismiss();
            }}
            className={cn(
              "mt-2 text-sm font-medium text-primary-600 hover:text-primary-500",
              "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 rounded",
              "dark:text-primary-400"
            )}
            tabIndex={0}
          >
            {toast.action.label}
          </button>
        )}
      </div>

      {toast.dismissible && (
        <button
          type="button"
          onClick={onDismiss}
          className={cn(
            "shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500",
            "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1",
            "dark:hover:bg-gray-700"
          )}
          aria-label={`Dismiss ${toast.title} notification`}
          tabIndex={0}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

/**
 * useToast hook
 */
export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }

  const { addToast, removeToast, clearToasts, toasts } = context;

  const toast = {
    /**
     * Show a success toast
     */
    success: (title: string, options?: Partial<ToastOptions>) =>
      addToast({ ...options, type: "success", title }),

    /**
     * Show an error toast
     */
    error: (title: string, options?: Partial<ToastOptions>) =>
      addToast({ ...options, type: "error", title }),

    /**
     * Show a warning toast
     */
    warning: (title: string, options?: Partial<ToastOptions>) =>
      addToast({ ...options, type: "warning", title }),

    /**
     * Show an info toast
     */
    info: (title: string, options?: Partial<ToastOptions>) =>
      addToast({ ...options, type: "info", title }),

    /**
     * Show a custom toast
     */
    custom: (options: ToastOptions) => addToast(options),

    /**
     * Dismiss a specific toast
     */
    dismiss: removeToast,

    /**
     * Clear all toasts
     */
    clearAll: clearToasts,

    /**
     * Current toasts
     */
    toasts,
  };

  return toast;
}

/**
 * Standalone toast function (requires ToastProvider in tree)
 * Use this outside of React components
 */
let toastHandler: ToastContextValue | null = null;

export function setToastHandler(handler: ToastContextValue) {
  toastHandler = handler;
}

export const toast = {
  success: (title: string, options?: Partial<ToastOptions>) =>
    toastHandler?.addToast({ ...options, type: "success", title }),
  error: (title: string, options?: Partial<ToastOptions>) =>
    toastHandler?.addToast({ ...options, type: "error", title }),
  warning: (title: string, options?: Partial<ToastOptions>) =>
    toastHandler?.addToast({ ...options, type: "warning", title }),
  info: (title: string, options?: Partial<ToastOptions>) =>
    toastHandler?.addToast({ ...options, type: "info", title }),
  dismiss: (id: string) => toastHandler?.removeToast(id),
  clearAll: () => toastHandler?.clearToasts(),
};
