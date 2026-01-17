import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end?: Date;
  color?: string;
  allDay?: boolean;
}

interface CalendarProps {
  events?: CalendarEvent[];
  onDateClick?: (date: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
  selectedDate?: Date;
  className?: string;
}

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export function Calendar({
  events = [],
  onDateClick,
  onEventClick,
  selectedDate,
  className,
}: CalendarProps) {
  const [viewDate, setViewDate] = useState(new Date());
  const [view, setView] = useState<"month" | "week">("month");

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const prevPeriod = () => {
    if (view === "month") {
      setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
    } else {
      const newDate = new Date(viewDate);
      newDate.setDate(newDate.getDate() - 7);
      setViewDate(newDate);
    }
  };

  const nextPeriod = () => {
    if (view === "month") {
      setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
    } else {
      const newDate = new Date(viewDate);
      newDate.setDate(newDate.getDate() + 7);
      setViewDate(newDate);
    }
  };

  const goToToday = () => {
    setViewDate(new Date());
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const isSelected = (date: Date) => {
    if (!selectedDate) return false;
    return (
      date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear()
    );
  };

  const getEventsForDate = (date: Date) => {
    return events.filter((event) => {
      const eventStart = new Date(event.start);
      return (
        eventStart.getDate() === date.getDate() &&
        eventStart.getMonth() === date.getMonth() &&
        eventStart.getFullYear() === date.getFullYear()
      );
    });
  };

  const monthDays = useMemo(() => {
    const days: (Date | null)[] = [];
    const daysInMonth = getDaysInMonth(viewDate);
    const firstDay = getFirstDayOfMonth(viewDate);

    // Add empty slots for days before the first day of month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    // Add all days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(viewDate.getFullYear(), viewDate.getMonth(), i));
    }

    return days;
  }, [viewDate]);

  const weekDays = useMemo(() => {
    const days: Date[] = [];
    const startOfWeek = new Date(viewDate);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(day.getDate() + i);
      days.push(day);
    }

    return days;
  }, [viewDate]);

  return (
    <div className={cn("bg-white rounded-lg border border-gray-200", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={prevPeriod} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold min-w-48 text-center">
            {view === "month"
              ? `${MONTHS[viewDate.getMonth()]} ${viewDate.getFullYear()}`
              : `Week of ${weekDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
          </h2>
          <Button variant="ghost" size="sm" onClick={nextPeriod} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
          <div className="flex border rounded-lg overflow-hidden">
            <button
              onClick={() => setView("month")}
              className={cn(
                "px-3 py-1.5 text-sm font-medium",
                view === "month" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
              )}
            >
              Month
            </button>
            <button
              onClick={() => setView("week")}
              className={cn(
                "px-3 py-1.5 text-sm font-medium",
                view === "week" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
              )}
            >
              Week
            </button>
          </div>
        </div>
      </div>

      {/* Month View */}
      {view === "month" && (
        <div className="p-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {DAYS_SHORT.map((day) => (
              <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((date, index) => {
              if (!date) {
                return <div key={`empty-${index}`} className="h-24" />;
              }

              const dayEvents = getEventsForDate(date);
              const today = isToday(date);
              const selected = isSelected(date);

              return (
                <div
                  key={date.toISOString()}
                  onClick={() => onDateClick?.(date)}
                  className={cn(
                    "h-24 border rounded-lg p-1 cursor-pointer transition-colors",
                    today && "bg-blue-50 border-blue-200",
                    selected && "ring-2 ring-blue-500",
                    !today && "hover:bg-gray-50"
                  )}
                >
                  <div
                    className={cn(
                      "text-sm font-medium mb-1",
                      today ? "text-blue-600" : "text-gray-900"
                    )}
                  >
                    {date.getDate()}
                  </div>
                  <div className="space-y-0.5 overflow-hidden">
                    {dayEvents.slice(0, 2).map((event) => (
                      <button
                        key={event.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventClick?.(event);
                        }}
                        className={cn(
                          "w-full text-left text-xs px-1 py-0.5 rounded truncate",
                          event.color || "bg-blue-100 text-blue-700"
                        )}
                      >
                        {event.title}
                      </button>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-xs text-gray-500 px-1">
                        +{dayEvents.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week View */}
      {view === "week" && (
        <div className="p-4">
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((date) => {
              const dayEvents = getEventsForDate(date);
              const today = isToday(date);
              const selected = isSelected(date);

              return (
                <div
                  key={date.toISOString()}
                  onClick={() => onDateClick?.(date)}
                  className={cn(
                    "min-h-32 border rounded-lg p-2 cursor-pointer transition-colors",
                    today && "bg-blue-50 border-blue-200",
                    selected && "ring-2 ring-blue-500",
                    !today && "hover:bg-gray-50"
                  )}
                >
                  <div className="text-center mb-2">
                    <div className="text-xs text-gray-500">{DAYS_SHORT[date.getDay()]}</div>
                    <div
                      className={cn(
                        "text-lg font-semibold",
                        today ? "text-blue-600" : "text-gray-900"
                      )}
                    >
                      {date.getDate()}
                    </div>
                  </div>
                  <div className="space-y-1">
                    {dayEvents.map((event) => (
                      <button
                        key={event.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventClick?.(event);
                        }}
                        className={cn(
                          "w-full text-left text-xs px-2 py-1 rounded",
                          event.color || "bg-blue-100 text-blue-700"
                        )}
                      >
                        <div className="font-medium truncate">{event.title}</div>
                        {!event.allDay && (
                          <div className="text-xs opacity-75">
                            {new Date(event.start).toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface MiniCalendarProps {
  value?: Date;
  onChange?: (date: Date) => void;
  className?: string;
}

export function MiniCalendar({ value, onChange, className }: MiniCalendarProps) {
  const [viewDate, setViewDate] = useState(value || new Date());

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

  const selectDate = (day: number) => {
    const selected = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    onChange?.(selected);
  };

  const daysInMonth = getDaysInMonth(viewDate);
  const firstDay = getFirstDayOfMonth(viewDate);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: firstDay }, (_, i) => i);

  return (
    <div className={cn("bg-white rounded-lg border border-gray-200 p-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <Button variant="ghost" size="sm" onClick={prevMonth} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">
          {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
        </span>
        <Button variant="ghost" size="sm" onClick={nextMonth} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAYS_SHORT.map((day) => (
          <div key={day} className="text-center text-xs font-medium text-gray-500 py-1">
            {day.charAt(0)}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {emptyDays.map((_, i) => (
          <div key={`empty-${i}`} className="h-7" />
        ))}
        {days.map((day) => {
          const selected = isSelected(day);
          const today = isToday(day);

          return (
            <button
              key={day}
              type="button"
              onClick={() => selectDate(day)}
              className={cn(
                "h-7 w-7 rounded-full text-xs transition-colors",
                "hover:bg-gray-100",
                selected && "bg-blue-600 text-white hover:bg-blue-700",
                today && !selected && "font-bold text-blue-600"
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
