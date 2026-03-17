/**
 * Input Component
 *
 * A comprehensive input component with support for labels, errors, icons,
 * and various input types. Integrates with React Hook Form.
 */

import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "../../lib/utils";

export type InputSize = "sm" | "md" | "lg";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  leftAddon?: string;
  rightAddon?: string;
  inputSize?: InputSize;
  fullWidth?: boolean;
}

const sizeStyles: Record<InputSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-4 py-2.5 text-base",
};

const iconSizeStyles: Record<InputSize, string> = {
  sm: "[&>svg]:w-4 [&>svg]:h-4",
  md: "[&>svg]:w-5 [&>svg]:h-5",
  lg: "[&>svg]:w-5 [&>svg]:h-5",
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      leftIcon,
      rightIcon,
      leftAddon,
      rightAddon,
      inputSize = "md",
      fullWidth = true,
      className,
      disabled,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || props.name;
    const hasError = !!error;

    return (
      <div className={cn(fullWidth && "w-full")}>
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {label}
            {props.required && <span className="ml-1 text-error-600">*</span>}
          </label>
        )}

        <div className="relative flex">
          {leftAddon && (
            <span className="inline-flex items-center rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400">
              {leftAddon}
            </span>
          )}

          <div className="relative flex-1">
            {leftIcon && (
              <span
                className={cn(
                  "pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400",
                  iconSizeStyles[inputSize]
                )}
              >
                {leftIcon}
              </span>
            )}

            <input
              ref={ref}
              id={inputId}
              disabled={disabled}
              aria-invalid={hasError}
              aria-describedby={hasError ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
              className={cn(
                // Base styles
                "block w-full rounded-lg border bg-white transition-colors duration-200",
                "placeholder:text-gray-400",
                "focus:outline-none focus:ring-2 focus:ring-offset-0",
                // Dark mode
                "dark:bg-gray-800 dark:placeholder:text-gray-500",
                // Size
                sizeStyles[inputSize],
                // Icons padding
                leftIcon && "pl-10",
                rightIcon && "pr-10",
                // Addons border radius
                leftAddon && "rounded-l-none",
                rightAddon && "rounded-r-none",
                // States
                hasError
                  ? "border-error-500 focus:border-error-500 focus:ring-error-500/20"
                  : "border-gray-300 focus:border-primary-500 focus:ring-primary-500/20 dark:border-gray-600 dark:focus:border-primary-500",
                // Disabled
                disabled && "cursor-not-allowed bg-gray-50 text-gray-500 dark:bg-gray-900",
                className
              )}
              {...props}
            />

            {rightIcon && (
              <span
                className={cn(
                  "pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400",
                  iconSizeStyles[inputSize]
                )}
              >
                {rightIcon}
              </span>
            )}
          </div>

          {rightAddon && (
            <span className="inline-flex items-center rounded-r-lg border border-l-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400">
              {rightAddon}
            </span>
          )}
        </div>

        {error && (
          <p id={`${inputId}-error`} className="mt-1.5 text-sm text-error-600 dark:text-error-400">
            {error}
          </p>
        )}

        {hint && !error && (
          <p id={`${inputId}-hint`} className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

/**
 * Textarea Component
 */
export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "size"> {
  label?: string;
  error?: string;
  hint?: string;
  inputSize?: InputSize;
  fullWidth?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      hint,
      inputSize = "md",
      fullWidth = true,
      className,
      disabled,
      id,
      rows = 4,
      ...props
    },
    ref
  ) => {
    const inputId = id || props.name;
    const hasError = !!error;

    return (
      <div className={cn(fullWidth && "w-full")}>
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {label}
            {props.required && <span className="ml-1 text-error-600">*</span>}
          </label>
        )}

        <textarea
          ref={ref}
          id={inputId}
          disabled={disabled}
          rows={rows}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={cn(
            // Base styles
            "block w-full rounded-lg border bg-white transition-colors duration-200",
            "placeholder:text-gray-400",
            "focus:outline-none focus:ring-2 focus:ring-offset-0",
            "resize-y",
            // Dark mode
            "dark:bg-gray-800 dark:placeholder:text-gray-500",
            // Size
            sizeStyles[inputSize],
            // States
            hasError
              ? "border-error-500 focus:border-error-500 focus:ring-error-500/20"
              : "border-gray-300 focus:border-primary-500 focus:ring-primary-500/20 dark:border-gray-600 dark:focus:border-primary-500",
            // Disabled
            disabled && "cursor-not-allowed bg-gray-50 text-gray-500 dark:bg-gray-900",
            className
          )}
          {...props}
        />

        {error && (
          <p id={`${inputId}-error`} className="mt-1.5 text-sm text-error-600 dark:text-error-400">
            {error}
          </p>
        )}

        {hint && !error && (
          <p id={`${inputId}-hint`} className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";

/**
 * Select Component
 */
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<InputHTMLAttributes<HTMLSelectElement>, "size"> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
  inputSize?: InputSize;
  fullWidth?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      hint,
      options,
      placeholder,
      inputSize = "md",
      fullWidth = true,
      className,
      disabled,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || props.name;
    const hasError = !!error;

    return (
      <div className={cn(fullWidth && "w-full")}>
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {label}
            {props.required && <span className="ml-1 text-error-600">*</span>}
          </label>
        )}

        <select
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={cn(
            // Base styles
            "block w-full appearance-none rounded-lg border bg-white transition-colors duration-200",
            "focus:outline-none focus:ring-2 focus:ring-offset-0",
            // Dark mode
            "dark:bg-gray-800",
            // Size
            sizeStyles[inputSize],
            "pr-10", // Space for dropdown arrow
            // States
            hasError
              ? "border-error-500 focus:border-error-500 focus:ring-error-500/20"
              : "border-gray-300 focus:border-primary-500 focus:ring-primary-500/20 dark:border-gray-600 dark:focus:border-primary-500",
            // Disabled
            disabled && "cursor-not-allowed bg-gray-50 text-gray-500 dark:bg-gray-900",
            className
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>

        {error && (
          <p id={`${inputId}-error`} className="mt-1.5 text-sm text-error-600 dark:text-error-400">
            {error}
          </p>
        )}

        {hint && !error && (
          <p id={`${inputId}-hint`} className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";

/**
 * Checkbox Component
 */
export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  description?: string;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, error, className, disabled, id, ...props }, ref) => {
    const inputId = id || props.name;

    return (
      <div className="flex items-start gap-3">
        <div className="flex h-5 items-center">
          <input
            ref={ref}
            type="checkbox"
            id={inputId}
            disabled={disabled}
            className={cn(
              "h-4 w-4 rounded border-gray-300 text-primary-600",
              "focus:ring-2 focus:ring-primary-500 focus:ring-offset-0",
              "dark:border-gray-600 dark:bg-gray-800",
              disabled && "cursor-not-allowed opacity-50",
              className
            )}
            {...props}
          />
        </div>
        {(label || description) && (
          <div>
            {label && (
              <label
                htmlFor={inputId}
                className={cn(
                  "text-sm font-medium text-gray-700 dark:text-gray-300",
                  disabled && "cursor-not-allowed opacity-50"
                )}
              >
                {label}
              </label>
            )}
            {description && (
              <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
            )}
            {error && (
              <p className="mt-1 text-sm text-error-600 dark:text-error-400">{error}</p>
            )}
          </div>
        )}
      </div>
    );
  }
);

Checkbox.displayName = "Checkbox";

/**
 * Radio Component
 */
export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  description?: string;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  ({ label, description, className, disabled, id, ...props }, ref) => {
    const inputId = id || `${props.name}-${props.value}`;

    return (
      <div className="flex items-start gap-3">
        <div className="flex h-5 items-center">
          <input
            ref={ref}
            type="radio"
            id={inputId}
            disabled={disabled}
            className={cn(
              "h-4 w-4 border-gray-300 text-primary-600",
              "focus:ring-2 focus:ring-primary-500 focus:ring-offset-0",
              "dark:border-gray-600 dark:bg-gray-800",
              disabled && "cursor-not-allowed opacity-50",
              className
            )}
            {...props}
          />
        </div>
        {(label || description) && (
          <div>
            {label && (
              <label
                htmlFor={inputId}
                className={cn(
                  "text-sm font-medium text-gray-700 dark:text-gray-300",
                  disabled && "cursor-not-allowed opacity-50"
                )}
              >
                {label}
              </label>
            )}
            {description && (
              <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
            )}
          </div>
        )}
      </div>
    );
  }
);

Radio.displayName = "Radio";

/**
 * RadioGroup Component
 */
export interface RadioGroupProps {
  name: string;
  value?: string;
  onChange?: (value: string) => void;
  options: { value: string; label: string; description?: string; disabled?: boolean }[];
  label?: string;
  error?: string;
  orientation?: "horizontal" | "vertical";
}

export function RadioGroup({
  name,
  value,
  onChange,
  options,
  label,
  error,
  orientation = "vertical",
}: RadioGroupProps) {
  return (
    <fieldset>
      {label && (
        <legend className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </legend>
      )}
      <div
        className={cn(
          "flex gap-4",
          orientation === "vertical" ? "flex-col" : "flex-row flex-wrap"
        )}
      >
        {options.map((option) => (
          <Radio
            key={option.value}
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange?.(option.value)}
            label={option.label}
            description={option.description}
            disabled={option.disabled}
          />
        ))}
      </div>
      {error && (
        <p className="mt-1.5 text-sm text-error-600 dark:text-error-400">{error}</p>
      )}
    </fieldset>
  );
}
