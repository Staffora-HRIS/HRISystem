export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useState, useEffect, useCallback } from "react";
import {
  Sun,
  Moon,
  Monitor,
  Save,
  Palette,
  Calendar,
  Clock,
  LayoutGrid,
  Check,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Select,
  RadioGroup,
  Input,
  useToast,
} from "~/components/ui";
import { useTheme, type Theme } from "~/lib/theme";

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

interface AppearancePreferences {
  accentColor: string;
  density: "compact" | "comfortable";
  dateFormat: string;
  timeFormat: "12h" | "24h";
}

const STORAGE_KEY = "staffora-appearance";

const DEFAULT_PREFS: AppearancePreferences = {
  accentColor: "#3B82F6",
  density: "comfortable",
  dateFormat: "DD/MM/YYYY",
  timeFormat: "24h",
};

const ACCENT_PRESETS: { value: string; label: string }[] = [
  { value: "#3B82F6", label: "Blue" },
  { value: "#8B5CF6", label: "Violet" },
  { value: "#EC4899", label: "Pink" },
  { value: "#10B981", label: "Emerald" },
  { value: "#F59E0B", label: "Amber" },
  { value: "#EF4444", label: "Red" },
  { value: "#6366F1", label: "Indigo" },
  { value: "#14B8A6", label: "Teal" },
];

const DATE_FORMAT_OPTIONS = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY (UK default)" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (ISO)" },
  { value: "DD.MM.YYYY", label: "DD.MM.YYYY" },
  { value: "DD-MM-YYYY", label: "DD-MM-YYYY" },
];

const TIME_FORMAT_OPTIONS = [
  { value: "24h", label: "24-hour (e.g. 14:30)" },
  { value: "12h", label: "12-hour (e.g. 2:30 PM)" },
];

const DENSITY_OPTIONS = [
  {
    value: "comfortable",
    label: "Comfortable",
    description: "More whitespace, easier to scan",
  },
  {
    value: "compact",
    label: "Compact",
    description: "Less whitespace, more information on screen",
  },
];

const THEME_CHOICES: {
  value: Theme;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    value: "light",
    label: "Light",
    description: "A clean, bright interface",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Easier on the eyes in low light",
    icon: Moon,
  },
  {
    value: "system",
    label: "System",
    description: "Follows your operating system preference",
    icon: Monitor,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadPreferences(): AppearancePreferences {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<AppearancePreferences>;
    return {
      accentColor:
        typeof parsed.accentColor === "string"
          ? parsed.accentColor
          : DEFAULT_PREFS.accentColor,
      density:
        parsed.density === "compact" || parsed.density === "comfortable"
          ? parsed.density
          : DEFAULT_PREFS.density,
      dateFormat:
        typeof parsed.dateFormat === "string"
          ? parsed.dateFormat
          : DEFAULT_PREFS.dateFormat,
      timeFormat:
        parsed.timeFormat === "12h" || parsed.timeFormat === "24h"
          ? parsed.timeFormat
          : DEFAULT_PREFS.timeFormat,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePreferences(prefs: AppearancePreferences): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

function formatDatePreview(format: string): string {
  const day = "17";
  const month = "03";
  const year = "2026";

  switch (format) {
    case "DD/MM/YYYY":
      return `${day}/${month}/${year}`;
    case "YYYY-MM-DD":
      return `${year}-${month}-${day}`;
    case "DD.MM.YYYY":
      return `${day}.${month}.${year}`;
    case "DD-MM-YYYY":
      return `${day}-${month}-${year}`;
    default:
      return `${day}/${month}/${year}`;
  }
}

function formatTimePreview(format: "12h" | "24h"): string {
  return format === "24h" ? "14:30" : "2:30 PM";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AppearanceSettingsPage() {
  const toast = useToast();
  const { theme, setTheme } = useTheme();

  const [prefs, setPrefs] = useState<AppearancePreferences>(DEFAULT_PREFS);
  const [isDirty, setIsDirty] = useState(false);

  // Load stored preferences on mount
  useEffect(() => {
    setPrefs(loadPreferences());
  }, []);

  const updatePref = useCallback(
    <K extends keyof AppearancePreferences>(
      key: K,
      value: AppearancePreferences[K],
    ) => {
      setPrefs((prev) => ({ ...prev, [key]: value }));
      setIsDirty(true);
    },
    [],
  );

  const handleSave = useCallback(() => {
    savePreferences(prefs);
    setIsDirty(false);
    toast.success("Appearance settings saved successfully");
  }, [prefs, toast]);

  const handleThemeChange = useCallback(
    (newTheme: Theme) => {
      setTheme(newTheme);
      // Theme is persisted immediately by the ThemeProvider, no need for isDirty
    },
    [setTheme],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Appearance
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Customise the look and feel of your Staffora experience
          </p>
        </div>
        <Button onClick={handleSave} disabled={!isDirty}>
          <Save className="h-4 w-4 mr-2" />
          Save Changes
        </Button>
      </div>

      {/* Theme Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sun className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <h2 className="font-semibold text-gray-900 dark:text-white">
              Theme
            </h2>
          </div>
        </CardHeader>
        <CardBody>
          <fieldset>
            <legend className="sr-only">Select theme</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {THEME_CHOICES.map((option) => {
                const isSelected = theme === option.value;
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => handleThemeChange(option.value)}
                    className={`
                      relative flex flex-col items-center gap-3 rounded-lg border-2 p-5
                      transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
                      ${
                        isSelected
                          ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                          : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500"
                      }
                    `}
                  >
                    {isSelected && (
                      <span className="absolute top-2 right-2">
                        <Check className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                      </span>
                    )}
                    <Icon
                      className={`h-8 w-8 ${
                        isSelected
                          ? "text-primary-600 dark:text-primary-400"
                          : "text-gray-400 dark:text-gray-400"
                      }`}
                    />
                    <div className="text-center">
                      <p
                        className={`text-sm font-medium ${
                          isSelected
                            ? "text-primary-700 dark:text-primary-300"
                            : "text-gray-900 dark:text-white"
                        }`}
                      >
                        {option.label}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {option.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </CardBody>
      </Card>

      {/* Accent Colour */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <h2 className="font-semibold text-gray-900 dark:text-white">
              Accent Colour
            </h2>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            {/* Preset swatches */}
            <fieldset>
              <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Choose a preset or pick a custom colour
              </legend>
              <div
                className="flex flex-wrap gap-3"
                role="radiogroup"
                aria-label="Accent colour presets"
              >
                {ACCENT_PRESETS.map((preset) => {
                  const isSelected =
                    prefs.accentColor.toLowerCase() ===
                    preset.value.toLowerCase();
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={preset.label}
                      onClick={() => updatePref("accentColor", preset.value)}
                      className={`
                        relative h-10 w-10 rounded-full border-2 transition-all
                        focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
                        ${
                          isSelected
                            ? "border-gray-900 dark:border-white scale-110"
                            : "border-transparent hover:scale-105"
                        }
                      `}
                      style={{ backgroundColor: preset.value }}
                      title={preset.label}
                    >
                      {isSelected && (
                        <Check className="h-5 w-5 text-white absolute inset-0 m-auto drop-shadow-sm" />
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Custom colour input */}
            <div className="flex items-end gap-3 max-w-xs">
              <div>
                <label
                  htmlFor="accent-color-picker"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  Custom colour
                </label>
                <input
                  type="color"
                  id="accent-color-picker"
                  title="Select custom accent colour"
                  aria-label="Custom accent colour picker"
                  value={prefs.accentColor}
                  onChange={(e) => updatePref("accentColor", e.target.value)}
                  className="h-10 w-14 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                />
              </div>
              <Input
                id="accent-color-hex"
                value={prefs.accentColor}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                    updatePref("accentColor", val);
                  }
                }}
                placeholder="#3B82F6"
                className="max-w-[120px]"
                aria-label="Hex colour value"
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Display Density */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <h2 className="font-semibold text-gray-900 dark:text-white">
              Display Density
            </h2>
          </div>
        </CardHeader>
        <CardBody>
          <RadioGroup
            name="density"
            value={prefs.density}
            onChange={(value) =>
              updatePref("density", value as "compact" | "comfortable")
            }
            options={DENSITY_OPTIONS}
            orientation="vertical"
          />
        </CardBody>
      </Card>

      {/* Date & Time Format */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <h2 className="font-semibold text-gray-900 dark:text-white">
              Date &amp; Time Format
            </h2>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Date format */}
            <div>
              <Select
                id="date-format"
                label="Date Format"
                value={prefs.dateFormat}
                onChange={(e) => updatePref("dateFormat", e.target.value)}
                options={DATE_FORMAT_OPTIONS}
              />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                <Calendar className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                Preview: {formatDatePreview(prefs.dateFormat)}
              </p>
            </div>

            {/* Time format */}
            <div>
              <Select
                id="time-format"
                label="Time Format"
                value={prefs.timeFormat}
                onChange={(e) =>
                  updatePref("timeFormat", e.target.value as "12h" | "24h")
                }
                options={TIME_FORMAT_OPTIONS}
              />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                <Clock className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                Preview: {formatTimePreview(prefs.timeFormat)}
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Save footer — visible on mobile when page is long */}
      <div className="flex justify-end pt-2 pb-4 sm:hidden">
        <Button onClick={handleSave} disabled={!isDirty} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          Save Changes
        </Button>
      </div>
    </div>
  );
}
