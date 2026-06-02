import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronRight } from "lucide-react";

interface ObstacleOrder {
  id: string;
  auftrags_nr: string;
  user_id: string;
  empfaenger_name: string;
  empfaenger_stadt: string;
  delivery_attempts: number;
  updated_at: string;
  last_reason: string | null;
}

interface Props {
  merchantNameMap: Map<string, string>;
  onSelect: (orderId: string) => void;
}

const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" });

export function ObstacleOrdersCard({ merchantNameMap, onSelect }: Props) {
  const [orders, setOrders] = useState<ObstacleOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: ordersData } = await supabase
        .from("orders")
        .select("id, auftrags_nr, user_id, empfaenger_name, empfaenger_stadt, delivery_attempts, updated_at")
        .eq("status", "nicht_zugestellt")
        .order("updated_at", { ascending: false })
        .limit(50);

      const list = (ordersData ?? []) as Omit<ObstacleOrder, "last_reason">[];
      const ids = list.map((o) => o.id);
      let reasonMap = new Map<string, string>();
      if (ids.length > 0) {
        const { data: hist } = await supabase
          .from("order_status_history")
          .select("order_id, reason, created_at")
          .in("order_id", ids)
          .eq("status", "nicht_zugestellt")
          .order("created_at", { ascending: false });
        (hist ?? []).forEach((h: { order_id: string; reason: string | null }) => {
          if (!reasonMap.has(h.order_id) && h.reason) reasonMap.set(h.order_id, h.reason);
        });
      }
      setOrders(list.map((o) => ({ ...o, last_reason: reasonMap.get(o.id) ?? null })));
      setLoading(false);
    };
    load();
  }, []);

  const visible = orders.slice(0, 5);

  return (
    <Card className="border-warning/30">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <CardTitle className="text-base">Bestellungen mit Hindernissen</CardTitle>
          <Badge variant="secondary">{orders.length}</Badge>
        </div>
        {orders.length > 5 && (
          <Button asChild size="sm" variant="ghost" className="text-xs">
            <Link to="/auftraege">Alle anzeigen <ChevronRight className="ml-1 h-3 w-3" /></Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Lade…</p>
        ) : visible.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            Aktuell keine Bestellungen mit Hindernissen.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((o) => (
              <li
                key={o.id}
                className="flex cursor-pointer items-start justify-between gap-3 py-2.5 hover:bg-muted/30"
                onClick={() => onSelect(o.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span>{o.auftrags_nr}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="truncate text-muted-foreground">
                      {merchantNameMap.get(o.user_id) ?? "Unbekannter Händler"}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {o.empfaenger_name} – {o.empfaenger_stadt}
                  </p>
                  {o.last_reason && (
                    <p className="mt-0.5 truncate text-xs italic text-warning">„{o.last_reason}"</p>
                  )}
                </div>
                <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
                  <Badge variant="outline" className="text-[10px]">
                    Versuch {o.delivery_attempts}
                  </Badge>
                  <div className="mt-1">{dateFmt.format(new Date(o.updated_at))}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}