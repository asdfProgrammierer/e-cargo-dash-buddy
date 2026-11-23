import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { Route, CalendarDays, Package, ChevronRight, ChevronLeft, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useExclusiveToursAccess } from "@/hooks/useExclusiveToursAccess";
import { deliveryPercent, type ExclusiveTour, type ExclusiveStop } from "@/lib/exclusiveTours";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHead } from "@/components/PageHead";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const routeLabels = { geplant: "Geplant", aktiv: "Unterwegs", abgeschlossen: "Abgeschlossen" };
const stopLabels = { offen: "Offen", erledigt: "Zugestellt", uebersprungen: "Nicht zugestellt" };
const dateLabel = (date: string) => new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }).format(new Date(`${date}T12:00:00+01:00`));
const timeLabel = (date: string) => new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(new Date(date));

export default function ExklusivtourenPage() {
  const { user, ownerUserId } = useAuth();
  const access = useExclusiveToursAccess();
  const client = useQueryClient();
  const [history, setHistory] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ExclusiveTour | null>(null);
  const tours = useQuery({
    queryKey: ["exclusive-tours", "list", user?.id, ownerUserId, history, page],
    enabled: access.data === true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("merchant_exclusive_tours", { _history: history, _page: page });
      if (error) throw error;
      return data as unknown as { routes: ExclusiveTour[]; has_more: boolean };
    },
    staleTime: 0,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
  const details = useQuery({
    queryKey: ["exclusive-tours", "detail", user?.id, ownerUserId, selected?.id],
    enabled: access.data === true && !!selected,
    queryFn: async () => {
      if (!selected) return [];
      const { data, error } = await supabase.rpc("merchant_exclusive_tour_detail", { _route_id: selected.id });
      if (error) throw error;
      return data as unknown as ExclusiveStop[];
    },
    staleTime: 0,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!ownerUserId || access.data !== true) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase.channel(`merchant-tours-${user?.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => { void client.invalidateQueries({ queryKey: ["exclusive-tours"] }); }, 300);
      }).subscribe();
    return () => { clearTimeout(timer); void supabase.removeChannel(channel); };
  }, [access.data, ownerUserId, user?.id, client]);

  if (access.data === false) return <Navigate to="/" replace />;

  return (
    <DashboardLayout title="Exklusivtouren">
      <PageHead title="Exklusivtouren – e-cargo" description="Ihre exklusiven e-cargo Touren mit aktuellem Sendungsfortschritt und Tourenverlauf." path="/exklusivtouren" />
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={history ? "history" : "current"} onValueChange={value => { setHistory(value === "history"); setPage(0); }}>
            <TabsList><TabsTrigger value="current">Aktuell & geplant</TabsTrigger><TabsTrigger value="history">Vergangene Touren</TabsTrigger></TabsList>
          </Tabs>
          <Button variant="outline" size="icon" aria-label="Touren aktualisieren" title="Touren aktualisieren" onClick={() => void client.invalidateQueries({ queryKey: ["exclusive-tours"] })}><RefreshCw className={`h-4 w-4 ${tours.isFetching ? "animate-spin motion-reduce:animate-none" : ""}`} /></Button>
        </div>
        {access.isError || tours.isError ? (
          <div role="alert" className="py-8 text-destructive">Touren konnten nicht geladen werden. <Button variant="outline" onClick={() => void client.invalidateQueries({ queryKey: ["exclusive-tours"] })}>Erneut versuchen</Button></div>
        ) : access.isPending || tours.isPending ? (
          <p role="status" className="py-12 text-muted-foreground">Touren werden geladen…</p>
        ) : tours.data?.routes.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground"><Route className="mx-auto mb-4 h-10 w-10" /><p>{history ? "Noch keine vergangenen Exklusivtouren." : "Aktuell sind keine Exklusivtouren geplant."}</p></div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {tours.data?.routes.map(tour => (
              <article key={tour.id} className="rounded-lg border border-border bg-card p-5 space-y-4 min-w-0">
                <div className="flex items-start justify-between gap-3"><h2 className="font-semibold text-lg break-words min-w-0">{tour.name}</h2><Badge variant={tour.status === "aktiv" ? "default" : "secondary"} className="shrink-0">{routeLabels[tour.status]}</Badge></div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground"><span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />{dateLabel(tour.datum)} · {tour.start_time.slice(0, 5)} Uhr</span><span className="flex items-center gap-2"><Package className="h-4 w-4" />{tour.parcels} Pakete</span></div>
                <div className="space-y-2"><div className="flex flex-wrap justify-between gap-2 text-sm"><span>{tour.delivered} von {tour.stops} Stopps zugestellt</span><span className="font-semibold text-primary">{deliveryPercent(tour)} %</span></div><Progress value={deliveryPercent(tour)} aria-label="Zustellfortschritt" />{tour.skipped > 0 && <p className="text-sm text-warning">{tour.skipped} nicht zugestellt</p>}</div>
                <Button variant="outline" className="w-full justify-between" onClick={() => setSelected(tour)}>Stopps ansehen<ChevronRight className="h-4 w-4" /></Button>
              </article>
            ))}
          </div>
        )}
        {(page > 0 || tours.data?.has_more) && <div className="flex items-center justify-center gap-4"><Button variant="outline" size="icon" aria-label="Vorherige Seite" disabled={page === 0 || tours.isFetching} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button><span className="text-sm">Seite {page + 1}</span><Button variant="outline" size="icon" aria-label="Nächste Seite" disabled={!tours.data?.has_more || tours.isFetching} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button></div>}
      </div>
      <Dialog open={!!selected && access.data === true} onOpenChange={open => { if (!open) setSelected(null); }}>
        <DialogContent className="max-w-3xl max-h-[85dvh] flex flex-col min-w-0">
          <DialogHeader><DialogTitle className="break-words pr-6">{selected?.name}</DialogTitle>{selected && <p className="text-sm text-muted-foreground">{dateLabel(selected.datum)} · {selected.start_time.slice(0, 5)} Uhr</p>}</DialogHeader>
          <div className="overflow-y-auto min-h-0">
            {details.isPending ? <p role="status" className="py-6">Stopps werden geladen…</p> : details.isError ? <p role="alert" className="text-destructive">Stopps konnten nicht geladen werden.</p> : details.data?.length === 0 ? <p className="py-6 text-muted-foreground">Keine Sendungen auf dieser Tour.</p> : (
              <ol className="divide-y divide-border">{details.data?.map(stop => <li key={stop.id} className="py-4 flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">{stop.position}</span>
                <div className="min-w-0 flex-1 space-y-1"><div className="flex flex-wrap items-start justify-between gap-2"><p className="font-medium break-words">{stop.empfaenger_name}</p><Badge variant={stop.status === "erledigt" ? "default" : "secondary"}>{stopLabels[stop.status]}</Badge></div><p className="text-sm text-muted-foreground break-words">{stop.empfaenger_adresse}, {stop.empfaenger_plz} {stop.empfaenger_stadt}</p><p className="text-xs text-muted-foreground">{stop.auftrags_nr} · {stop.pakete} Pakete</p>{stop.delivered_at ? <p className="text-sm text-primary">Zugestellt um {timeLabel(stop.delivered_at)} Uhr</p> : stop.eta && stop.status === "offen" ? <p className="text-sm text-muted-foreground">Geplant: {timeLabel(stop.eta)} Uhr</p> : null}</div>
              </li>)}</ol>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}