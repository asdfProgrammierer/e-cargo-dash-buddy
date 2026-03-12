import { Button } from "@/components/ui/button";
import { OrderStatus, STATUS_LABELS } from "@/types/order";

interface StatusFilterProps {
  activeFilter: OrderStatus | "alle";
  onFilter: (status: OrderStatus | "alle") => void;
}

const filters: (OrderStatus | "alle")[] = ["alle", "neu", "in_bearbeitung", "unterwegs", "zugestellt", "storniert"];

const FILTER_LABELS: Record<string, string> = {
  alle: "Alle",
  ...STATUS_LABELS,
};

export function StatusFilter({ activeFilter, onFilter }: StatusFilterProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {filters.map((f) => (
        <Button
          key={f}
          variant={activeFilter === f ? "default" : "ghost"}
          size="sm"
          className="h-8 text-xs"
          onClick={() => onFilter(f)}
        >
          {FILTER_LABELS[f]}
        </Button>
      ))}
    </div>
  );
}
