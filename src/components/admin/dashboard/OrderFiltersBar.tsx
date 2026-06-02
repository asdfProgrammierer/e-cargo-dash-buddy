import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X } from "lucide-react";

export type TimeRange = "today" | "7" | "30" | "all";

export interface OrderFilterState {
  range: TimeRange;
  merchant: string;
  city: string;
  search: string;
}

const STORAGE_KEY = "admin-overview-filters";

export const DEFAULT_FILTERS: OrderFilterState = {
  range: "all",
  merchant: "all",
  city: "",
  search: "",
};

export function loadStoredFilters(): OrderFilterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_FILTERS;
}

interface Props {
  filters: OrderFilterState;
  onChange: (next: OrderFilterState) => void;
  merchants: Array<{ id: string; label: string }>;
}

export function OrderFiltersBar({ filters, onChange, merchants }: Props) {
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch {
      /* ignore */
    }
  }, [filters]);

  const isActive =
    filters.range !== "all" ||
    filters.merchant !== "all" ||
    filters.city.trim() !== "" ||
    filters.search.trim() !== "";

  const set = (patch: Partial<OrderFilterState>) => onChange({ ...filters, ...patch });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="Suche Auftrag, Empfänger, Tracking…"
          className="h-8 w-56 pl-7 text-xs"
        />
      </div>
      <Select value={filters.range} onValueChange={(v) => set({ range: v as TimeRange })}>
        <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Heute</SelectItem>
          <SelectItem value="7">7 Tage</SelectItem>
          <SelectItem value="30">30 Tage</SelectItem>
          <SelectItem value="all">Alle</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filters.merchant} onValueChange={(v) => set({ merchant: v })}>
        <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Händler" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle Händler</SelectItem>
          {merchants.map((m) => (
            <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        value={filters.city}
        onChange={(e) => set({ city: e.target.value })}
        placeholder="Stadt"
        className="h-8 w-32 text-xs"
      />
      {isActive && (
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onChange(DEFAULT_FILTERS)}>
          <X className="mr-1 h-3 w-3" /> Zurücksetzen
        </Button>
      )}
    </div>
  );
}