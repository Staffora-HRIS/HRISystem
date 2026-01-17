/**
 * GlobalEmployeeSearch Component
 *
 * A global search component for finding employees across the system
 * with keyboard navigation and quick preview support
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  Search,
  X,
  User,
  Building2,
  Briefcase,
  ChevronRight,
} from "lucide-react";
import { Avatar } from "~/components/ui";
import { api } from "~/lib/api-client";
import { cn } from "~/lib/utils";

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  employeeNumber: string;
  positionTitle: string | null;
  departmentName: string | null;
  status: string;
  photoUrl: string | null;
}

interface EmployeeSearchResponse {
  items: Employee[];
  hasMore: boolean;
}

export interface GlobalEmployeeSearchProps {
  onSelect?: (employee: Employee) => void;
  onClose?: () => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export function GlobalEmployeeSearch({
  onSelect,
  onClose,
  placeholder = "Search employees...",
  className,
  autoFocus = false,
}: GlobalEmployeeSearchProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["global-employee-search", search],
    queryFn: async () => {
      if (!search || search.length < 2) return { items: [], hasMore: false };
      return api.get<EmployeeSearchResponse>(
        `/hr/employees?search=${encodeURIComponent(search)}&limit=10`
      );
    },
    enabled: search.length >= 2,
  });

  const employees = data?.items ?? [];

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [employees]);

  const handleSelect = useCallback(
    (employee: Employee) => {
      if (onSelect) {
        onSelect(employee);
      } else {
        navigate(`/admin/hr/employees/${employee.id}`);
      }
      setSearch("");
      setIsOpen(false);
      onClose?.();
    },
    [onSelect, navigate, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || employees.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, employees.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (employees[selectedIndex]) {
            handleSelect(employees[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          onClose?.();
          break;
      }
    },
    [isOpen, employees, selectedIndex, handleSelect, onClose]
  );

  useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  return (
    <div className={cn("relative", className)}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(e.target.value.length >= 2);
          }}
          onFocus={() => setIsOpen(search.length >= 2)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full h-10 pl-10 pr-10 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {search && (
          <button
            onClick={() => {
              setSearch("");
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded"
            aria-label="Clear search"
            title="Clear search"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-96 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          ) : employees.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <User className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No employees found</p>
              <p className="text-xs text-gray-400">Try a different search term</p>
            </div>
          ) : (
            <div ref={listRef}>
              {employees.map((employee, index) => (
                <button
                  key={employee.id}
                  onClick={() => handleSelect(employee)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 text-left transition-colors",
                    index === selectedIndex
                      ? "bg-blue-50"
                      : "hover:bg-gray-50"
                  )}
                >
                  <Avatar
                    src={employee.photoUrl}
                    name={`${employee.firstName} ${employee.lastName}`}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {employee.firstName} {employee.lastName}
                      </span>
                      <span className="text-xs text-gray-400">
                        {employee.employeeNumber}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      {employee.positionTitle && (
                        <span className="flex items-center gap-1">
                          <Briefcase className="h-3 w-3" />
                          {employee.positionTitle}
                        </span>
                      )}
                      {employee.departmentName && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {employee.departmentName}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
