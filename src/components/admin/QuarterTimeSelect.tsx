import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QUARTER_MINUTES, scheduleTimeParts } from "@/lib/driverScheduleDates";

const NONE = "keine";
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));

interface Props {
  /** "HH:MM" or "" for no start time. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/** Startzeit as two dropdowns; minutes are limited to the 15-minute rhythm (00, 15, 30, 45). */
export function QuarterTimeSelect({ value, onChange, disabled }: Props) {
  const { hour, minute } = scheduleTimeParts(value);
  const empty = value === "";
  return (
    <div className="flex gap-2">
      <Select value={empty ? NONE : hour} onValueChange={(h) => onChange(h === NONE ? "" : `${h}:${minute}`)} disabled={disabled}>
        <SelectTrigger aria-label="Startzeit Stunde"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>keine</SelectItem>
          {HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={empty ? NONE : minute} onValueChange={(m) => onChange(`${hour}:${m}`)} disabled={disabled || empty}>
        <SelectTrigger aria-label="Startzeit Minute"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE} disabled>—</SelectItem>
          {QUARTER_MINUTES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
