import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { RouteRevenueInfo } from "@/hooks/useRouteRevenues";
import type { RouteRevenue } from "@/lib/routeRevenue";

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

function Breakdown({ r }: { r: RouteRevenue }) {
  return (
    <div className="space-y-0.5 tabular-nums">
      {r.packages > 0 && <div>Pakete: {eur(r.packages)}</div>}
      {r.stops > 0 && <div>Stopps: {eur(r.stops)}</div>}
      {r.hours > 0 && <div>Stunden: {eur(r.hours)}</div>}
      {r.daily > 0 && <div>Tagespauschale: {eur(r.daily)}</div>}
    </div>
  );
}

export function RouteRevenueBadge({ info }: { info?: RouteRevenueInfo }) {
  if (!info) return null;
  const { planned, actual } = info;
  const diff = actual ? actual.total - planned.total : 0;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-caption tabular-nums text-muted-foreground whitespace-nowrap">
          {actual ? (
            <>
              <span className="font-medium text-foreground">Umsatz {eur(actual.total)}</span>
              {Math.abs(diff) >= 0.01 && (
                <span className={diff > 0 ? "text-primary" : "text-destructive"}> ({diff > 0 ? "+" : ""}{eur(diff)})</span>
              )}
            </>
          ) : (
            <>Vorauss. {eur(planned.total)}</>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent className="text-xs">
        <div className="font-medium mb-1">Voraussichtlich: {eur(planned.total)}</div>
        <Breakdown r={planned} />
        {actual && (
          <>
            <div className="font-medium mt-2 mb-1">Tatsächlich: {eur(actual.total)}</div>
            <Breakdown r={actual} />
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
