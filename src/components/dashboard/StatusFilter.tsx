import { Button } from "@/components/ui/button";
import { OrderStatus, STATUS_LABELS } from "@/types/order";

interface StatusFilterProps {
  activeFilter: OrderStatus | "alle";
  onFilter: (status: OrderStatus | "alle") => void;
}

const filters: (OrderStatus | "alle")[] = ["alle", "neu", "in_bearbeitung", "unterwegs", "zugestellt", "nicht_zugestellt", "storniert"];

const FILTER_LABELS: Record<string, string> = {
  alle: "Alle",
  ...STATUS_LABELS,
};

export function StatusFilter({ activeFilter, onFilter }: StatusFilterProps) {
  return (
    <div className="flex flex-nowrap gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 sm:overflow-visible sm:mx-0 sm:px-0 sm:pb-0">
      {filters.map((f) => (
        <Button
          key={f}
          variant={activeFilter === f ? "default" : "ghost"}
          size="sm"
          className="h-8 text-xs shrink-0"
          onClick={() => onFilter(f)}
        >
          {FILTER_LABELS[f]}
        </Button>
      ))}
    </div>
  );
}
