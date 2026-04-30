import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const WEEKDAYS = [
  { value: 1, short: "Mo" },
  { value: 2, short: "Di" },
  { value: 3, short: "Mi" },
  { value: 4, short: "Do" },
  { value: 5, short: "Fr" },
  { value: 6, short: "Sa" },
  { value: 7, short: "So" },
];

interface Props {
  profileId: string;
  pickupEnabled: boolean;
  pickupWeekdays: number[];
  onChange: (next: { pickup_enabled: boolean; pickup_weekdays: number[] }) => void;
}

export function PickupSettingsCell({ profileId, pickupEnabled, pickupWeekdays, onChange }: Props) {
  const [saving, setSaving] = useState(false);
  const [localDays, setLocalDays] = useState<number[]>(pickupWeekdays ?? []);

  const persist = async (updates: { pickup_enabled?: boolean; pickup_weekdays?: number[] }) => {
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", profileId);
    setSaving(false);
    if (error) {
      toast.error("Konnte Abhol-Einstellung nicht speichern");
      return false;
    }
    onChange({
      pickup_enabled: updates.pickup_enabled ?? pickupEnabled,
      pickup_weekdays: updates.pickup_weekdays ?? pickupWeekdays,
    });
    toast.success("Abhol-Einstellung gespeichert");
    return true;
  };

  const toggleDay = (day: number) => {
    setLocalDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  };

  const sortedDays = [...(pickupWeekdays ?? [])].sort((a, b) => a - b);
  const dayLabels = sortedDays.map((d) => WEEKDAYS.find((w) => w.value === d)?.short).filter(Boolean);

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={pickupEnabled}
        disabled={saving}
        onCheckedChange={(checked) => persist({ pickup_enabled: checked })}
      />
      {pickupEnabled && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1">
              <Settings2 className="h-3.5 w-3.5" />
              {dayLabels.length > 0 ? (
                <span className="text-xs">{dayLabels.join(", ")}</span>
              ) : (
                <Badge variant="outline" className="border-warning text-warning text-[10px]">
                  Tage wählen
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56" align="end">
            <div className="space-y-2">
              <p className="text-sm font-medium">Abholtage</p>
              <div className="grid grid-cols-2 gap-2">
                {WEEKDAYS.map((d) => (
                  <label key={d.value} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={localDays.includes(d.value)}
                      onCheckedChange={() => toggleDay(d.value)}
                    />
                    {d.short}
                  </label>
                ))}
              </div>
              <Button
                size="sm"
                className="w-full"
                disabled={saving}
                onClick={async () => {
                  await persist({ pickup_weekdays: localDays });
                }}
              >
                Speichern
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}