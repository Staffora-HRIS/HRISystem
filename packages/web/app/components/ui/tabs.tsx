/**
 * Tabs Component
 *
 * Tab navigation component with multiple variants
 */

import { useState, createContext, useContext, type ReactNode } from "react";
import { cn } from "../../lib/utils";

// Context
interface TabsContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  variant: TabsVariant;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error("Tabs components must be used within a Tabs provider");
  }
  return context;
}

// Types
export type TabsVariant = "line" | "pills" | "enclosed" | "soft";

export interface TabsProps {
  children: ReactNode;
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  variant?: TabsVariant;
  className?: string;
}

export interface TabsListProps {
  children: ReactNode;
  className?: string;
}

export interface TabsTriggerProps {
  value: string;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  icon?: ReactNode;
}

export interface TabsContentProps {
  value: string;
  children: ReactNode;
  className?: string;
}

// Components
export function Tabs({
  children,
  defaultValue,
  value,
  onValueChange,
  variant = "line",
  className,
}: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue || "");
  
  const activeTab = value !== undefined ? value : internalValue;
  const setActiveTab = (tab: string) => {
    if (value === undefined) {
      setInternalValue(tab);
    }
    onValueChange?.(tab);
  };

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab, variant }}>
      <div className={cn("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className }: TabsListProps) {
  const { variant } = useTabsContext();

  const variantClasses = {
    line: "border-b border-gray-200",
    pills: "bg-gray-100 p-1 rounded-lg",
    enclosed: "border-b border-gray-200",
    soft: "bg-gray-100/50 p-1 rounded-lg",
  };

  return (
    <div
      role="tablist"
      className={cn(
        "flex gap-1",
        variantClasses[variant],
        className
      )}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  children,
  disabled = false,
  className,
  icon,
}: TabsTriggerProps) {
  const { activeTab, setActiveTab, variant } = useTabsContext();
  const isActive = activeTab === value;

  const baseClasses = "inline-flex items-center justify-center gap-2 font-medium transition-colors focus:outline-none disabled:opacity-50 disabled:pointer-events-none";

  const variantClasses = {
    line: cn(
      "px-4 py-2 border-b-2 -mb-px text-sm",
      isActive
        ? "border-blue-600 text-blue-600"
        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
    ),
    pills: cn(
      "px-3 py-1.5 rounded-md text-sm",
      isActive
        ? "bg-white text-gray-900 shadow-sm"
        : "text-gray-600 hover:text-gray-900"
    ),
    enclosed: cn(
      "px-4 py-2 border border-transparent rounded-t-lg text-sm -mb-px",
      isActive
        ? "bg-white border-gray-200 border-b-white text-gray-900"
        : "text-gray-500 hover:text-gray-700"
    ),
    soft: cn(
      "px-3 py-1.5 rounded-md text-sm",
      isActive
        ? "bg-white text-blue-600 shadow-sm"
        : "text-gray-600 hover:text-gray-900 hover:bg-white/50"
    ),
  };

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive ? "true" : "false"}
      aria-controls={`panel-${value}`}
      disabled={disabled}
      onClick={() => setActiveTab(value)}
      className={cn(baseClasses, variantClasses[variant], className)}
    >
      {icon}
      {children}
    </button>
  );
}

export function TabsContent({ value, children, className }: TabsContentProps) {
  const { activeTab } = useTabsContext();

  if (activeTab !== value) {
    return null;
  }

  return (
    <div
      role="tabpanel"
      id={`panel-${value}`}
      className={cn("mt-4", className)}
    >
      {children}
    </div>
  );
}
