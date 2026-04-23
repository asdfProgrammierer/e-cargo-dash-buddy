import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Clock3, Plus, Trash2 } from "lucide-react";

export const OPENING_HOURS_DAYS = [
  { key: "monday", label: "Montag" },
  { key: "tuesday", label: "Dienstag" },
  { key: "wednesday", label: "Mittwoch" },
  { key: "thursday", label: "Donnerstag" },
  { key: "friday", label: "Freitag" },
  { key: "saturday", label: "Samstag" },
  { key: "sunday", label: "Sonntag" },
] as const;

export type OpeningHoursKey = (typeof OPENING_HOURS_DAYS)[number]["key"];

export type OpeningHoursRange = {
  start: string;
  end: string;
};

export type OpeningHoursDay = {
  closed: boolean;
  ranges: OpeningHoursRange[];
};

export type OpeningHoursState = Record<OpeningHoursKey, OpeningHoursDay>;

const EMPTY_DAY: OpeningHoursDay = {
  closed: false,
  ranges: [],
};

export const EMPTY_OPENING_HOURS: OpeningHoursState = {
  monday: { ...EMPTY_DAY, ranges: [] },
  tuesday: { ...EMPTY_DAY, ranges: [] },
  wednesday: { ...EMPTY_DAY, ranges: [] },
  thursday: { ...EMPTY_DAY, ranges: [] },
  friday: { ...EMPTY_DAY, ranges: [] },
  saturday: { ...EMPTY_DAY, ranges: [] },
  sunday: { ...EMPTY_DAY, ranges: [] },
};

function normalizeTime(value: unknown) {
  if (typeof value !== "string") return "";

  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return "";

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function parseLegacyString(value: string): OpeningHoursDay {
  const normalized = value.trim();
  if (!normalized) return { ...EMPTY_DAY, ranges: [] };
  if (/geschlossen/i.test(normalized)) return { closed: true, ranges: [] };

  const ranges = Array.from(normalized.matchAll(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/g))
    .map((match) => ({
      start: normalizeTime(match[1]),
      end: normalizeTime(match[2]),
    }))
    .filter((range) => range.start && range.end);

  return {
    closed: false,
    ranges,
  };
}

function normalizeDay(value: unknown): OpeningHoursDay {
  if (typeof value === "string") {
    return parseLegacyString(value);
  }

  if (!value || typeof value !== "object") {
    return { ...EMPTY_DAY, ranges: [] };
  }

  const candidate = value as Partial<OpeningHoursDay>;
  const ranges = Array.isArray(candidate.ranges)
    ? candidate.ranges
        .map((range) => ({
          start: normalizeTime(range?.start),
          end: normalizeTime(range?.end),
        }))
        .filter((range) => range.start && range.end)
    : [];

  return {
    closed: Boolean(candidate.closed),
    ranges,
  };
}

export function normalizeOpeningHours(value: unknown): OpeningHoursState {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return OPENING_HOURS_DAYS.reduce((acc, day) => {
    acc[day.key] = normalizeDay(source[day.key]);
    return acc;
  }, {} as OpeningHoursState);
}

type OpeningHoursEditorProps = {
  value: OpeningHoursState;
  onChange: (value: OpeningHoursState) => void;
};

export function OpeningHoursEditor({ value, onChange }: OpeningHoursEditorProps) {
  const updateDay = (day: OpeningHoursKey, nextDay: OpeningHoursDay) => {
    onChange({
      ...value,
      [day]: nextDay,
    });
  };

  const addRange = (day: OpeningHoursKey) => {
    updateDay(day, {
      ...value[day],
      ranges: [...value[day].ranges, { start: "", end: "" }],
    });
  };

  const updateRange = (day: OpeningHoursKey, index: number, field: keyof OpeningHoursRange, nextValue: string) => {
    updateDay(day, {
      ...value[day],
      ranges: value[day].ranges.map((range, rangeIndex) =>
        rangeIndex === index ? { ...range, [field]: nextValue } : range,
      ),
    });
  };

  const removeRange = (day: OpeningHoursKey, index: number) => {
    updateDay(day, {
      ...value[day],
      ranges: value[day].ranges.filter((_, rangeIndex) => rangeIndex !== index),
    });
  };

  return (
    <div className="space-y-3">
      {OPENING_HOURS_DAYS.map((day) => {
        const dayValue = value[day.key];

        return (
          <div key={day.key} className="rounded-lg border border-border bg-background p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-primary" />
                <span className="font-medium">{day.label}</span>
              </div>

              <div className="flex items-center gap-3">
                <Label htmlFor={`closed-${day.key}`} className="text-sm text-muted-foreground">
                  Geschlossen
                </Label>
                <Switch
                  id={`closed-${day.key}`}
                  checked={dayValue.closed}
                  onCheckedChange={(checked) =>
                    updateDay(day.key, {
                      closed: checked,
                      ranges: checked ? [] : dayValue.ranges,
                    })
                  }
                />
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {dayValue.closed ? (
                <p className="text-sm text-muted-foreground">An diesem Tag ist der Standort geschlossen.</p>
              ) : (
                <>
                  {dayValue.ranges.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Noch keine Zeitspanne hinterlegt.</p>
                  ) : null}

                  {dayValue.ranges.map((range, index) => (
                    <div
                      key={`${day.key}-${index}`}
                      className={cn(
                        "grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end",
                        dayValue.ranges.length > 1 && "rounded-md border border-border p-3",
                      )}
                    >
                      <div className="space-y-2">
                        <Label>Von</Label>
                        <Input
                          type="time"
                          step={300}
                          value={range.start}
                          onChange={(e) => updateRange(day.key, index, "start", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Bis</Label>
                        <Input
                          type="time"
                          step={300}
                          value={range.end}
                          onChange={(e) => updateRange(day.key, index, "end", e.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => removeRange(day.key, index)}
                        aria-label={`Zeitspanne für ${day.label} entfernen`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}

                  <Button type="button" variant="outline" size="sm" onClick={() => addRange(day.key)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Zeitspanne hinzufügen
                  </Button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}