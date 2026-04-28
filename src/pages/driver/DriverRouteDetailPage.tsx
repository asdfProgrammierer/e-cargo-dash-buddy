import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DriverLayout } from "@/components/driver/DriverLayout";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Navigation, Phone, CheckCircle2, XCircle, Package, MapPin } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface Stop {
  id: string;
  position: number;
  status: string;
  eta: string | null;
  notiz: string | null;
  order: {
    id: string;
    auftrags_nr: string;
    empfaenger_name: string;
    empfaenger_adresse: string;
    empfaenger_plz: string;
    empfaenger_stadt: string;
    empfaenger_telefon: string | null;
    pakete: number;
    notizen: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
}

const REASONS = [
  "Empfänger nicht angetroffen",
  "Adresse nicht auffindbar",
  "Annahme verweigert",
  "Beschädigt",
  "Sonstiges",
];

const DriverRouteDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const [routeName, setRouteName] = useState("Route");
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStop, setActiveStop] = useState<Stop | null>(null);
  const [reason, setReason] = useState(REASONS[0]);
  const [extraNote, setExtraNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!id) return;
    const { data: route } = await supabase.from("routes").select("name").eq("id", id).maybeSingle();
    if (route) setRouteName(route.name);

    const { data } = await supabase
      .from("route_stops")
      .select(
        "id, position, status, eta, notiz, order_id, orders(id, auftrags_nr, empfaenger_name, empfaenger_adresse, empfaenger_plz, empfaenger_stadt, empfaenger_telefon, pakete, notizen, lat, lng)",
      )
      .eq("route_id", id)
      .order("position", { ascending: true });

    const mapped: Stop[] = (data ?? []).map((s: any) => ({
      id: s.id,
      position: s.position,
      status: s.status,
      eta: s.eta,
      notiz: s.notiz,
      order: s.orders,
    }));
    setStops(mapped);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  const updateStatus = async (stopId: string, status: "erledigt" | "uebersprungen", reasonText?: string) => {
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("driver-update-stop-status", {
      body: { stop_id: stopId, status, reason: reasonText },
    });
    setSubmitting(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? "Fehler beim Speichern");
      return;
    }
    toast.success(status === "erledigt" ? "Als zugestellt markiert" : "Als nicht zugestellt markiert");
    setActiveStop(null);
    setExtraNote("");
    load();
  };

  const navigate = (s: Stop) => {
    const o = s.order;
    if (!o) return;

    const addrText = `${o.empfaenger_adresse}, ${o.empfaenger_plz} ${o.empfaenger_stadt}`;
    const addr = encodeURIComponent(addrText);
    const label = encodeURIComponent(o.empfaenger_name);
    const hasCoords = o.lat != null && o.lng != null;
    const coords = hasCoords ? `${o.lat},${o.lng}` : null;

    const ua = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isAndroid = /Android/i.test(ua);

    let url: string;
    if (isIOS) {
      // Apple Maps Deep-Link, Driving-Modus
      url = coords
        ? `maps://?daddr=${coords}&dirflg=d`
        : `maps://?daddr=${addr}&dirflg=d`;
    } else if (isAndroid) {
      // Google Maps Navigation Intent (öffnet direkt Turn-by-Turn)
      url = coords
        ? `google.navigation:q=${coords}&mode=d`
        : `google.navigation:q=${addr}&mode=d`;
    } else {
      // Desktop / Fallback: Google Maps im Browser
      url = coords
        ? `https://www.google.com/maps/dir/?api=1&destination=${coords}&travelmode=driving`
        : `https://www.google.com/maps/dir/?api=1&destination=${addr}&travelmode=driving`;
    }

    // Fallback falls Deep-Link nicht greift (z. B. Google Maps nicht installiert)
    const fallback = coords
      ? `https://www.google.com/maps/dir/?api=1&destination=${coords}&travelmode=driving`
      : `https://www.google.com/maps/dir/?api=1&destination=${addr}&travelmode=driving`;

    const start = Date.now();
    window.location.href = url;
    if (isIOS || isAndroid) {
      setTimeout(() => {
        if (Date.now() - start < 2000 && document.visibilityState === "visible") {
          window.location.href = fallback;
        }
      }, 1200);
    }
    // label wird aktuell nicht in den Deep-Links benötigt
    void label;
  };

  const done = stops.filter((s) => s.status === "erledigt" || s.status === "uebersprungen").length;
  const total = stops.length;
  const pct = total > 0 ? (done / total) * 100 : 0;

  return (
    <DriverLayout title={routeName} showBack>
      <div className="sticky top-14 bg-card border-b px-4 py-2 z-[5]">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Fortschritt</span>
          <span>{done} / {total}</span>
        </div>
        <Progress value={pct} className="h-2" />
      </div>

      <div className="p-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : stops.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">Keine Stopps</div>
        ) : (
          stops.map((s) => {
            const o = s.order;
            if (!o) return null;
            const isDone = s.status === "erledigt";
            const isSkipped = s.status === "uebersprungen";
            return (
              <div
                key={s.id}
                className={`bg-card border rounded-xl p-4 shadow-sm ${isDone ? "opacity-60" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm ${isDone ? "bg-primary text-primary-foreground" : isSkipped ? "bg-destructive/20 text-destructive" : "bg-muted"}`}>
                    {isDone ? <CheckCircle2 className="h-5 w-5" /> : isSkipped ? <XCircle className="h-5 w-5" /> : s.position + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h3 className="font-semibold truncate">{o.empfaenger_name}</h3>
                      {s.eta && (
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {new Date(s.eta).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground flex items-start gap-1">
                      <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      <span>{o.empfaenger_adresse}, {o.empfaenger_plz} {o.empfaenger_stadt}</span>
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Package className="h-3 w-3" />{o.pakete}</span>
                      <span>{o.auftrags_nr}</span>
                    </div>
                    {o.notizen && <p className="text-xs mt-2 p-2 bg-muted rounded">{o.notizen}</p>}
                    {isSkipped && s.notiz && <p className="text-xs mt-2 p-2 bg-destructive/10 text-destructive rounded">Grund: {s.notiz}</p>}
                  </div>
                </div>

                {!isDone && !isSkipped && (
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <Button variant="outline" size="sm" onClick={() => navigate(s)}>
                      <Navigation className="h-4 w-4" />
                    </Button>
                    {o.empfaenger_telefon ? (
                      <Button variant="outline" size="sm" asChild>
                        <a href={`tel:${o.empfaenger_telefon}`}>
                          <Phone className="h-4 w-4" />
                        </a>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" disabled>
                        <Phone className="h-4 w-4 opacity-30" />
                      </Button>
                    )}
                    <Button size="sm" onClick={() => updateStatus(s.id, "erledigt")} disabled={submitting}>
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      OK
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="col-span-3 text-destructive hover:text-destructive"
                      onClick={() => { setActiveStop(s); setReason(REASONS[0]); setExtraNote(""); }}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Nicht zugestellt
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <Sheet open={!!activeStop} onOpenChange={(o) => !o && setActiveStop(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Grund auswählen</SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-4">
            <RadioGroup value={reason} onValueChange={setReason}>
              {REASONS.map((r) => (
                <div key={r} className="flex items-center space-x-2">
                  <RadioGroupItem value={r} id={r} />
                  <Label htmlFor={r} className="font-normal">{r}</Label>
                </div>
              ))}
            </RadioGroup>
            <Textarea
              placeholder="Notiz (optional)"
              value={extraNote}
              onChange={(e) => setExtraNote(e.target.value)}
              rows={2}
            />
            <Button
              className="w-full"
              variant="destructive"
              disabled={submitting}
              onClick={() => {
                if (!activeStop) return;
                const fullReason = extraNote ? `${reason} – ${extraNote}` : reason;
                updateStatus(activeStop.id, "uebersprungen", fullReason);
              }}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Bestätigen"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </DriverLayout>
  );
};

export default DriverRouteDetailPage;