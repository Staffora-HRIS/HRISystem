/**
 * Modal Component
 *
 * A flexible modal dialog component with support for different sizes,
 * animations, and accessibility features.
 */

import {
  forwardRef,
  useEffect,
  useCallback,
  type HTMLAttributes,
  type ReactNode,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";
import { Button, type ButtonProps } from "./button";
import { useFocusTrap } from "../../hooks/use-focus-trap";

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  size?: ModalSize;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  preventScroll?: boolean;
  className?: string;
  overlayClassName?: string;
  children: ReactNode;
  /** Selector for the element that should receive initial focus. Falls back to the first focusable element. */
  initialFocusSelector?: string;
  /** Accessible label for the dialog. Uses aria-label when no aria-labelledby is appropriate. */
  "aria-label"?: string;
  /** ID of the element that labels the dialog. */
  "aria-labelledby"?: string;
  /** ID of the element that describes the dialog. */
  "aria-describedby"?: string;
}

const sizeStyles: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)]",
};

export function Modal({
  open,
  onClose,
  size = "md",
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  preventScroll = true,
  className,
  overlayClassName,
  children,
  initialFocusSelector,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
}: ModalProps) {
  // Focus trap: traps Tab focus within the modal and restores focus on close
  const focusTrapRef = useFocusTrap<HTMLDivElement>({
    enabled: open,
    autoFocus: true,
    restoreFocus: true,
    initialFocusSelector,
  });

  // Handle escape key
  const handleKeyDown = useCallback(
    (event: globalThis.KeyboardEvent) => {
      if (closeOnEscape && event.key === "Escape") {
        onClose();
      }
    },
    [closeOnEscape, onClose]
  );

  // Prevent scroll on body when modal is open
  useEffect(() => {
    if (!preventScroll) return;

    if (open) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [open, preventScroll]);

  // Add keyboard listener
  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [open, handleKeyDown]);

  // Handle overlay click
  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (closeOnOverlayClick && event.target === event.currentTarget) {
      onClose();
    }
  };

  if (!open) return null;

  // Check if we're in browser environment for portal
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center p-4",
        "animate-in fade-in duration-200",
        overlayClassName
      )}
    >
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleOverlayClick}
        aria-hidden="true"
      />

      {/* Modal content */}
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        className={cn(
          "relative z-10 w-full rounded-xl bg-white shadow-xl",
          "animate-in zoom-in-95 slide-in-from-bottom-4 duration-200",
          "dark:bg-gray-800",
          sizeStyles[size],
          className
        )}
      >
        {showCloseButton && (
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "absolute right-4 top-4 rounded-lg p-1.5",
              "text-gray-400 hover:bg-gray-100 hover:text-gray-500",
              "focus:outline-none focus:ring-2 focus:ring-primary-500",
              "dark:hover:bg-gray-700 dark:hover:text-gray-300"
            )}
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}

/**
 * ModalHeader Component
 */
export interface ModalHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  subtitle?: ReactNode;
}

export const ModalHeader = forwardRef<HTMLDivElement, ModalHeaderProps>(
  ({ title, subtitle, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("border-b border-gray-200 px-6 py-4 dark:border-gray-700", className)}
        {...props}
      >
        {title || subtitle ? (
          <>
            {title && (
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
            )}
          </>
        ) : (
          children
        )}
      </div>
    );
  }
);

ModalHeader.displayName = "ModalHeader";

/**
 * ModalBody Component
 */
export interface ModalBodyProps extends HTMLAttributes<HTMLDivElement> {
  padding?: "none" | "sm" | "md" | "lg";
}

export const ModalBody = forwardRef<HTMLDivElement, ModalBodyProps>(
  ({ padding = "md", className, children, ...props }, ref) => {
    const paddingStyles: Record<string, string> = {
      none: "",
      sm: "px-4 py-3",
      md: "px-6 py-4",
      lg: "px-8 py-6",
    };

    return (
      <div
        ref={ref}
        className={cn("max-h-[70vh] overflow-y-auto", paddingStyles[padding], className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

ModalBody.displayName = "ModalBody";

/**
 * ModalFooter Component
 */
export interface ModalFooterProps extends HTMLAttributes<HTMLDivElement> {
  justify?: "start" | "end" | "center" | "between";
}

export const ModalFooter = forwardRef<HTMLDivElement, ModalFooterProps>(
  ({ justify = "end", className, children, ...props }, ref) => {
    const justifyStyles: Record<string, string> = {
      start: "justify-start",
      end: "justify-end",
      center: "justify-center",
      between: "justify-between",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center gap-3 border-t border-gray-200 px-6 py-4",
          "dark:border-gray-700",
          justifyStyles[justify],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

ModalFooter.displayName = "ModalFooter";

/**
 * ConfirmModal - Pre-built confirmation dialog
 */
export interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonProps["variant"];
  loading?: boolean;
  danger?: boolean;
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant,
  loading = false,
  danger = false,
}: ConfirmModalProps) {
  const variant = confirmVariant || (danger ? "danger" : "primary");

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <ModalHeader title={title} />
      <ModalBody>
        <div className="text-gray-600 dark:text-gray-300">{message}</div>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button variant={variant} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/**
 * AlertModal - Pre-built alert dialog
 */
export interface AlertModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message: ReactNode;
  type?: "info" | "success" | "warning" | "error";
  buttonLabel?: string;
}

export function AlertModal({
  open,
  onClose,
  title,
  message,
  type = "info",
  buttonLabel = "OK",
}: AlertModalProps) {
  const iconColors: Record<string, string> = {
    info: "text-primary-500",
    success: "text-success-500",
    warning: "text-warning-500",
    error: "text-error-500",
  };

  const icons: Record<string, ReactNode> = {
    info: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    success: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    warning: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
    ),
    error: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  };

  return (
    <Modal open={open} onClose={onClose} size="sm" showCloseButton={false}>
      <ModalBody padding="lg">
        <div className="text-center">
          <div className={cn("mx-auto mb-4 inline-flex", iconColors[type])}>
            {icons[type]}
          </div>
          <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
            {title}
          </h3>
          <div className="text-gray-600 dark:text-gray-300">{message}</div>
        </div>
      </ModalBody>
      <ModalFooter justify="center">
        <Button onClick={onClose}>{buttonLabel}</Button>
      </ModalFooter>
    </Modal>
  );
}
