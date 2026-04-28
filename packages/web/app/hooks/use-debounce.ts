/**
 * useDebounce Hook
 *
 * Returns a debounced version of the provided value.
 * Updates only after the specified delay has elapsed
 * since the last change, preventing excessive API calls
 * on rapid user input (e.g., search fields).
 */

import { useState, useEffect } from "react";

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
