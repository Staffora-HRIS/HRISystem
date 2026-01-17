import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

interface DatePickerProps {
  value?: Date | null;
  onChange?: (date: Date | null) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
  error?: boolean;
}

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export function DatePicker({
  value,
  onChange,
  placeholder = "Select date",
  disabled = false,
  minDate,
  maxDate,
  className,
  error,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(value || new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const prevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const selectDate = (day: number) => {
    const selected = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    onChange?.(selected);
    setIsOpen(false);
  };

  const isDateDisabled = (day: number) => {
    const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;
    return false;
  };

  const isToday = (day: number) => {
    const today = new Date();
    return (
      day === today.getDate() &&
      viewDate.getMonth() === today.getMonth() &&
      viewDate.getFullYear() === today.getFullYear()
    );
  };

  const isSelected = (day: number) => {
    if (!value) return false;
    return (
      day === value.getDate() &&
      viewDate.getMonth() === value.getMonth() &&
      viewDate.getFullYear() === value.getFullYear()
    );
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const daysInMonth = getDaysInMonth(viewDate);
  const firstDay = getFirstDayOfMonth(viewDate);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: firstDay }, (_, i) => i);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-lg border bg-white px-3 py-2 text-sm",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
          disabled && "bg-gray-100 cursor-not-allowed opacity-60",
          error ? "border-red-500" : "border-gray-200",
          !disabled && "hover:border-gray-300"
        )}
      >
        <span className={value ? "text-gray-900" : "text-gray-400"}>
          {value ? formatDate(value) : placeholder}
        </span>
        <CalendarIcon className="h-4 w-4 text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-72 rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="sm" onClick={prevMonth} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium">
              {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
            </span>
            <Button variant="ghost" size="sm" onClick={nextMonth} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAYS.map((day) => (
              <div key={day} className="text-center text-xs font-medium text-gray-500 py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {emptyDays.map((_, i) => (
              <div key={`empty-${i}`} className="h-8" />
            ))}
            {days.map((day) => {
              const dayDisabled = isDateDisabled(day);
              const selected = isSelected(day);
              const today = isToday(day);

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => !dayDisabled && selectDate(day)}
                  disabled={dayDisabled}
                  className={cn(
                    "h-8 w-8 rounded-full text-sm transition-colors",
                    dayDisabled && "text-gray-300 cursor-not-allowed",
                    !dayDisabled && !selected && "hover:bg-gray-100",
                    selected && "bg-blue-600 text-white hover:bg-blue-700",
                    today && !selected && "font-bold text-blue-600"
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Today button */}
          <div className="mt-3 pt-3 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                const today = new Date();
                setViewDate(today);
                onChange?.(today);
                setIsOpen(false);
              }}
            >
              Today
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface DateRangePickerProps {
  startDate?: Date | null;
  endDate?: Date | null;
  onChange?: (range: { start: Date | null; end: Date | null }) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function DateRangePicker({
  startDate,
  endDate,
  onChange,
  placeholder = "Select date range",
  disabled = false,
  className,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selecting, setSelecting] = useState<"start" | "end">("start");
  const [tempStart, setTempStart] = useState<Date | null>(startDate || null);
  const [tempEnd, setTempEnd] = useState<Date | null>(endDate || null);
  const [viewDate, setViewDate] = useState(startDate || new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const prevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const selectDate = (day: number) => {
    const selected = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);

    if (selecting === "start") {
      setTempStart(selected);
      setTempEnd(null);
      setSelecting("end");
    } else {
      if (tempStart && selected < tempStart) {
        setTempEnd(tempStart);
        setTempStart(selected);
      } else {
        setTempEnd(selected);
      }
      onChange?.({ start: tempStart, end: selected < (tempStart || selected) ? tempStart : selected });
      setIsOpen(false);
      setSelecting("start");
    }
  };

  const isInRange = (day: number) => {
    if (!tempStart || !tempEnd) return false;
    const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    return date > tempStart && date < tempEnd;
  };

  const isRangeStart = (day: number) => {
    if (!tempStart) return false;
    return (
      day === tempStart.getDate() &&
      viewDate.getMonth() === tempStart.getMonth() &&
      viewDate.getFullYear() === tempStart.getFullYear()
    );
  };

  const isRangeEnd = (day: number) => {
    if (!tempEnd) return false;
    return (
      day === tempEnd.getDate() &&
      viewDate.getMonth() === tempEnd.getMonth() &&
      viewDate.getFullYear() === tempEnd.getFullYear()
    );
  };

  const formatRange = () => {
    if (!startDate && !endDate) return placeholder;
    if (startDate && !endDate) return formatDate(startDate) + " - ...";
    if (startDate && endDate) return `${formatDate(startDate)} - ${formatDate(endDate)}`;
    return placeholder;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const daysInMonth = getDaysInMonth(viewDate);
  const firstDay = getFirstDayOfMonth(viewDate);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: firstDay }, (_, i) => i);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
          disabled && "bg-gray-100 cursor-not-allowed opacity-60",
          !disabled && "hover:border-gray-300"
        )}
      >
        <span className={startDate ? "text-gray-900" : "text-gray-400"}>
          {formatRange()}
        </span>
        <CalendarIcon className="h-4 w-4 text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-72 rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
          <div className="text-xs text-gray-500 mb-2">
            {selecting === "start" ? "Select start date" : "Select end date"}
          </div>

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="sm" onClick={prevMonth} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium">
              {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
            </span>
            <Button variant="ghost" size="sm" onClick={nextMonth} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAYS.map((day) => (
              <div key={day} className="text-center text-xs font-medium text-gray-500 py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {emptyDays.map((_, i) => (
              <div key={`empty-${i}`} className="h-8" />
            ))}
            {days.map((day) => {
              const rangeStart = isRangeStart(day);
              const rangeEnd = isRangeEnd(day);
              const inRange = isInRange(day);

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDate(day)}
                  className={cn(
                    "h-8 w-8 rounded-full text-sm transition-colors",
                    "hover:bg-gray-100",
                    (rangeStart || rangeEnd) && "bg-blue-600 text-white hover:bg-blue-700",
                    inRange && "bg-blue-100"
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
