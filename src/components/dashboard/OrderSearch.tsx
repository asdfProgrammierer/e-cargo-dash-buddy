import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface OrderSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function OrderSearch({ value, onChange }: OrderSearchProps) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Suche nach Nr., Name, Stadt…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9 h-9 text-sm"
      />
    </div>
  );
}
