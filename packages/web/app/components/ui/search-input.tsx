/**
 * SearchInput Component
 *
 * Search input with icon, clear button, and debounce support
 */

import { useState, useEffect, useRef, type ChangeEvent, type KeyboardEvent } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

export interface SearchInputProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onSearch?: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  loading?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  inputClassName?: string;
  showClearButton?: boolean;
}

const sizeClasses = {
  sm: "h-8 text-sm pl-8 pr-8",
  md: "h-10 text-sm pl-10 pr-10",
  lg: "h-12 text-base pl-12 pr-12",
};

const iconSizeClasses = {
  sm: "h-4 w-4 left-2",
  md: "h-4 w-4 left-3",
  lg: "h-5 w-5 left-3.5",
};

const clearButtonClasses = {
  sm: "right-2",
  md: "right-3",
  lg: "right-3.5",
};

export function SearchInput({
  value,
  defaultValue = "",
  onChange,
  onSearch,
  placeholder = "Search...",
  debounceMs = 300,
  loading = false,
  disabled = false,
  autoFocus = false,
  size = "md",
  className,
  inputClassName,
  showClearButton = true,
}: SearchInputProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentValue = value !== undefined ? value : internalValue;

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    
    if (value === undefined) {
      setInternalValue(newValue);
    }
    
    onChange?.(newValue);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (onSearch && debounceMs > 0) {
      debounceRef.current = setTimeout(() => {
        onSearch(newValue);
      }, debounceMs);
    } else if (onSearch) {
      onSearch(newValue);
    }
  };

  const handleClear = () => {
    if (value === undefined) {
      setInternalValue("");
    }
    onChange?.("");
    onSearch?.("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onSearch) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      onSearch(currentValue);
    }
    if (e.key === "Escape") {
      handleClear();
    }
  };

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "absolute top-1/2 -translate-y-1/2 text-gray-400",
          iconSizeClasses[size]
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Search className="h-4 w-4" />
        )}
      </div>
      <input
        ref={inputRef}
        type="search"
        value={currentValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "w-full rounded-lg border border-gray-300 bg-white",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
          "disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed",
          "placeholder:text-gray-400",
          sizeClasses[size],
          inputClassName
        )}
      />
      {showClearButton && currentValue && !loading && (
        <button
          type="button"
          onClick={handleClear}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded",
            clearButtonClasses[size]
          )}
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
