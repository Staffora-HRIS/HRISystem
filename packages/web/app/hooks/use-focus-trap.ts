/**
 * useFocusTrap Hook
 *
 * Traps focus within a container element, cycling through focusable elements
 * when Tab / Shift+Tab is pressed. Optionally auto-focuses the first
 * focusable element on mount and restores focus to a previously focused
 * element on unmount.
 *
 * Designed for modals, dialogs, and sheet/drawer overlays.
 */

import { useEffect, useRef, useCallback, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable]:not([tabindex="-1"])',
].join(", ");

export interface UseFocusTrapOptions {
  /** Whether the trap is currently active. */
  enabled?: boolean;
  /** Auto-focus the first focusable element when the trap activates. */
  autoFocus?: boolean;
  /** Restore focus to the previously focused element when the trap deactivates. */
  restoreFocus?: boolean;
  /** Selector for the element that should receive initial focus. If not found, falls back to the first focusable element. */
  initialFocusSelector?: string;
}

/**
 * Returns a ref to attach to the container element that should trap focus.
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>(
  options: UseFocusTrapOptions = {}
): RefObject<T | null> {
  const {
    enabled = true,
    autoFocus = true,
    restoreFocus = true,
    initialFocusSelector,
  } = options;

  const containerRef = useRef<T | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const getFocusableElements = useCallback((): HTMLElement[] => {
    if (!containerRef.current) return [];
    const elements = containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    return Array.from(elements).filter(
      (el) => !el.hasAttribute("disabled") && el.offsetParent !== null
    );
  }, []);

  // Capture the previously focused element and auto-focus
  useEffect(() => {
    if (!enabled) return;

    // Save the currently focused element so we can restore it later
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    if (autoFocus) {
      // Use requestAnimationFrame to wait for the container to be rendered
      const rafId = requestAnimationFrame(() => {
        if (!containerRef.current) return;

        // Try initial focus selector first
        if (initialFocusSelector) {
          const target = containerRef.current.querySelector<HTMLElement>(initialFocusSelector);
          if (target) {
            target.focus();
            return;
          }
        }

        // Fall back to first focusable element
        const focusableElements = getFocusableElements();
        if (focusableElements.length > 0) {
          focusableElements[0].focus();
        } else {
          // If no focusable elements, focus the container itself
          containerRef.current?.setAttribute("tabindex", "-1");
          containerRef.current?.focus();
        }
      });

      return () => cancelAnimationFrame(rafId);
    }
  }, [enabled, autoFocus, initialFocusSelector, getFocusableElements]);

  // Restore focus when the trap is disabled or component unmounts
  useEffect(() => {
    if (!enabled) return;

    return () => {
      if (restoreFocus && previousFocusRef.current) {
        // Use requestAnimationFrame to ensure the DOM has updated
        requestAnimationFrame(() => {
          if (previousFocusRef.current && previousFocusRef.current.isConnected) {
            previousFocusRef.current.focus();
          }
        });
      }
    };
  }, [enabled, restoreFocus]);

  // Handle Tab key to trap focus
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      if (!containerRef.current) return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        // Shift+Tab: if we're on the first element, wrap to the last
        if (activeElement === firstElement || !containerRef.current.contains(activeElement)) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: if we're on the last element, wrap to the first
        if (activeElement === lastElement || !containerRef.current.contains(activeElement)) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, getFocusableElements]);

  return containerRef;
}

/**
 * useFocusRestore Hook
 *
 * Saves the currently focused element on mount and restores focus
 * to it on unmount. Useful for dropdown menus that need to return
 * focus to the trigger button when closed.
 */
export function useFocusRestore(enabled: boolean = true): void {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    return () => {
      if (previousFocusRef.current && previousFocusRef.current.isConnected) {
        requestAnimationFrame(() => {
          previousFocusRef.current?.focus();
        });
      }
    };
  }, [enabled]);
}

/**
 * useRovingTabindex Hook
 *
 * Implements roving tabindex pattern for lists of interactive elements
 * (e.g., menu items, tab triggers). Only the currently active item has
 * tabindex=0; all others have tabindex=-1. Arrow keys move focus.
 *
 * Returns a handler to attach to the container.
 */
export interface UseRovingTabindexOptions {
  /** Axis of navigation: 'horizontal' for left/right, 'vertical' for up/down, 'both' for all four arrows. */
  orientation?: "horizontal" | "vertical" | "both";
  /** Whether pressing Home/End should jump to first/last items. */
  homeEnd?: boolean;
  /** Whether focus should wrap around at the beginning/end. */
  loop?: boolean;
}

export function useRovingTabindex(
  options: UseRovingTabindexOptions = {}
): (event: React.KeyboardEvent) => void {
  const { orientation = "horizontal", homeEnd = true, loop = true } = options;

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const container = event.currentTarget as HTMLElement;
      const items = Array.from(
        container.querySelectorAll<HTMLElement>(
          '[role="tab"], [role="menuitem"], [role="option"], [data-roving-item]'
        )
      ).filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-disabled") !== "true");

      if (items.length === 0) return;

      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      let nextIndex = -1;

      const prev = () => {
        if (currentIndex <= 0) {
          nextIndex = loop ? items.length - 1 : 0;
        } else {
          nextIndex = currentIndex - 1;
        }
      };

      const next = () => {
        if (currentIndex >= items.length - 1) {
          nextIndex = loop ? 0 : items.length - 1;
        } else {
          nextIndex = currentIndex + 1;
        }
      };

      switch (event.key) {
        case "ArrowLeft":
          if (orientation === "horizontal" || orientation === "both") {
            event.preventDefault();
            prev();
          }
          break;
        case "ArrowRight":
          if (orientation === "horizontal" || orientation === "both") {
            event.preventDefault();
            next();
          }
          break;
        case "ArrowUp":
          if (orientation === "vertical" || orientation === "both") {
            event.preventDefault();
            prev();
          }
          break;
        case "ArrowDown":
          if (orientation === "vertical" || orientation === "both") {
            event.preventDefault();
            next();
          }
          break;
        case "Home":
          if (homeEnd) {
            event.preventDefault();
            nextIndex = 0;
          }
          break;
        case "End":
          if (homeEnd) {
            event.preventDefault();
            nextIndex = items.length - 1;
          }
          break;
      }

      if (nextIndex >= 0 && nextIndex < items.length) {
        items.forEach((item, i) => {
          item.setAttribute("tabindex", i === nextIndex ? "0" : "-1");
        });
        items[nextIndex].focus();
      }
    },
    [orientation, homeEnd, loop]
  );

  return handleKeyDown;
}
