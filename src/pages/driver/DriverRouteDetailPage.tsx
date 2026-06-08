import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DriverLayout } from "@/components/driver/DriverLayout";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Navigation, Phone, CheckCircle2, XCircle, Package, MapPin, ArrowRight, PenLine, Play, Home, MessageSquare, Camera } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { SignaturePad, type SignaturePadHandle } from "@/components/driver/SignaturePad";
import { buildOrderPdfBlob } from "@/lib/orderPdf";
import { useDeliveryModes } from "@/hooks/useDeliveryModes";
import type { Order } from "@/types/order";

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

interface Depot {
  id: string;
  name: string;
  strasse: string;
  plz: string;
  stadt: string;
  lat: number | null;
  lng: number | null;
}

const REASONS = [
  "Empfänger nicht angetroffen",
  "Adresse nicht auffindbar",
  "Annahme verweigert",
  "Beschädigt",
  "Sonstiges",
];

type DeliveryModeKey = string;

// Trennt den vom Kunden gepflegten Lieferanweisungs-Block von sonstigen Notizen.
const INSTRUCTION_START = "--- Lieferanweisung des Kunden ---";
const INSTRUCTION_END = "--- Ende Lieferanweisung ---";

function splitNotes(raw: string | null | undefined): {
  customerInstructions: string | null;
  internalNotes: string | null;
} {
  if (!raw) return { customerInstructions: null, internalNotes: null };
  const startIdx = raw.indexOf(INSTRUCTION_START);
  if (startIdx === -1) return { customerInstructions: null, internalNotes: raw.trim() || null };
  const endIdx = raw.indexOf(INSTRUCTION_END, startIdx);
  if (endIdx === -1) {
    const block = raw.slice(startIdx + INSTRUCTION_START.length).trim();
    const before = raw.slice(0, startIdx).trim();
    return { customerInstructions: block || null, internalNotes: before || null };
  }
  const block = raw.slice(startIdx + INSTRUCTION_START.length, endIdx).trim();
  const before = raw.slice(0, startIdx).trim();
  const after = raw.slice(endIdx + INSTRUCTION_END.length).trim();
  const internal = [before, after].filter(Boolean).join("\n\n").trim();
  return { customerInstructions: block || null, internalNotes: internal || null };
}

const DriverRouteDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { modes: deliveryModes } = useDeliveryModes({ onlyActive: true });
  const [routeName, setRouteName] = useState("Route");
  const [routeStatus, setRouteStatus] = useState<string>("geplant");
  const [endDepot, setEndDepot] = useState<Depot | null>(null);
  const [startingRoute, setStartingRoute] = useState(false);
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStop, setActiveStop] = useState<Stop | null>(null);
  const [reason, setReason] = useState(REASONS[0]);
  const [extraNote, setExtraNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Delivery confirmation sheet state
  const [deliverStop, setDeliverStop] = useState<Stop | null>(null);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryModeKey>("persoenlich");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [deliveryRecipient, setDeliveryRecipient] = useState("");
  const sigPadRef = useRef<SignaturePadHandle>(null);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const activeMode = deliveryModes.find((m) => m.key === deliveryMode) ?? null;

  const load = async () => {
    if (!id) return;
    const { data: route } = await supabase
      .from("routes")
      .select("name, status, end_depot_id, start_depot_id")
      .eq("id", id)
      .maybeSingle();
    if (route) {
      setRouteName(route.name);
      setRouteStatus(route.status);
      const depotId = route.end_depot_id ?? route.start_depot_id ?? null;
      if (depotId) {
        const { data: depot } = await supabase
          .from("depots")
          .select("id, name, strasse, plz, stadt, lat, lng")
          .eq("id", depotId)
          .maybeSingle();
        if (depot) {
          setEndDepot({
            id: depot.id,
            name: depot.name,
            strasse: depot.strasse,
            plz: depot.plz,
            stadt: depot.stadt,
            lat: depot.lat != null ? Number(depot.lat) : null,
            lng: depot.lng != null ? Number(depot.lng) : null,
          });
        }
      }
    }

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

  const updateStatus = async (
    stopId: string,
    status: "erledigt" | "uebersprungen",
    payload: {
      reason?: string;
      delivery_mode?: DeliveryModeKey;
      delivery_note?: string;
      delivery_recipient?: string;
      signature_base64?: string | null;
      photo_base64?: string | null;
    } = {},
  ) => {
    setSubmitting(true);
    // Best-effort GPS-Stempel (kein Blocker bei Fehler/Ablehnung)
    const gps = await getCurrentGps();
    if (!gps) {
      console.warn("[driver] Kein GPS-Stempel verfügbar (Berechtigung verweigert oder Timeout)");
      toast.warning("Kein GPS-Standort erfasst – Lieferschein ohne Karte");
    }
    const { data, error } = await supabase.functions.invoke("driver-update-stop-status", {
      body: {
        stop_id: stopId,
        status,
        ...payload,
        ...(gps
          ? { completed_lat: gps.lat, completed_lng: gps.lng, completed_accuracy_m: gps.acc }
          : {}),
      },
    });
    if (error || (data as any)?.error) {
      setSubmitting(false);
      const msg = (data as any)?.error ?? error?.message ?? "Fehler beim Speichern";
      // Stale session: auth user no longer exists → force re-login
      if (msg === "Ungültige Sitzung" || msg === "Nicht authentifiziert" || /401|403/.test(String(msg))) {
        toast.error("Sitzung abgelaufen, bitte erneut anmelden");
        await supabase.auth.signOut();
        window.location.href = "/fahrer/login";
        return;
      }
      toast.error(msg);
      return;
    }

    // After a successful delivery, generate & archive the signed delivery-note PDF
    let archived = false;
    if (status === "erledigt") {
      const orderId = stops.find((s) => s.id === stopId)?.order?.id;
      if (orderId) {
        archived = await archiveDeliveryNote(stopId, orderId);
      }
    }
    setSubmitting(false);
    if (status === "erledigt") {
      toast.success(
        archived ? "Zugestellt · Lieferschein archiviert" : "Als zugestellt markiert",
      );
    } else {
      toast.success("Als nicht zugestellt markiert");
    }
    setActiveStop(null);
    setDeliverStop(null);
    setExtraNote("");
    setDeliveryNote("");
    setDeliveryRecipient("");
    setDeliveryMode("persoenlich");
    await load();

    // Auto-close route + start navigation back to depot
    const result = data as { route_completed?: boolean; end_depot?: Depot | null };
    if (result?.route_completed) {
      const depot = result.end_depot ?? endDepot;
      setRouteStatus("abgeschlossen");
      if (depot) {
        setEndDepot(depot);
        toast.success("Route abgeschlossen · Navigation zum Depot startet");
        setTimeout(() => navigateToDepot(depot), 800);
      } else {
        toast.success("Route abgeschlossen");
        toast.warning("Kein Depot hinterlegt – keine Heimfahrt-Navigation");
      }
    }
  };

  const startRoute = async () => {
    if (!id) return;
    setStartingRoute(true);
    const { data, error } = await supabase.functions.invoke("driver-start-route", {
      body: { route_id: id },
    });
    setStartingRoute(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? "Route konnte nicht gestartet werden");
      return;
    }
    toast.success("Route gestartet · Pakete sind unterwegs");
    setRouteStatus("aktiv");
    load();
  };

  const archiveDeliveryNote = async (stopId: string, orderId: string): Promise<boolean> => {
    try {
      // Load full order data needed for the PDF
      const { data: o, error: oErr } = await supabase
        .from("orders")
        .select(
          "id, auftrags_nr, absender_name, absender_adresse, empfaenger_name, empfaenger_adresse, empfaenger_plz, empfaenger_stadt, empfaenger_email, empfaenger_telefon, pakete, gewicht, package_length_cm, package_width_cm, package_height_cm, status, notizen, created_at",
        )
        .eq("id", orderId)
        .maybeSingle();
      if (oErr || !o) return false;

      const order: Order = {
        id: o.id,
        auftragsNr: o.auftrags_nr,
        absenderName: o.absender_name,
        absenderAdresse: o.absender_adresse ?? "",
        empfaengerName: o.empfaenger_name,
        empfaengerAdresse: o.empfaenger_adresse ?? "",
        empfaengerPlz: o.empfaenger_plz ?? "",
        empfaengerStadt: o.empfaenger_stadt,
        empfaengerEmail: o.empfaenger_email ?? undefined,
        empfaengerTelefon: o.empfaenger_telefon ?? undefined,
        pakete: o.pakete,
        gewicht: Number(o.gewicht),
        packageLengthCm: o.package_length_cm ? Number(o.package_length_cm) : undefined,
        packageWidthCm: o.package_width_cm ? Number(o.package_width_cm) : undefined,
        packageHeightCm: o.package_height_cm ? Number(o.package_height_cm) : undefined,
        status: o.status as Order["status"],
        erstelltAm: new Date(o.created_at).toLocaleDateString("de-DE"),
        notizen: o.notizen ?? undefined,
      };

      const blob = await buildOrderPdfBlob(order);
      const path = `orders/${orderId}/${stopId}-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("delivery-notes")
        .upload(path, blob, { contentType: "application/pdf", upsert: true });
      if (upErr) {
        console.error("delivery-note upload failed", upErr);
        return false;
      }
      const { error: updErr } = await supabase
        .from("route_stops")
        .update({ delivery_note_pdf_url: path })
        .eq("id", stopId);
      if (updErr) {
        console.error("delivery-note url save failed", updErr);
        return false;
      }
      return true;
    } catch (e) {
      console.error("archiveDeliveryNote error", e);
      return false;
    }
  };

  const openDeliverSheet = (s: Stop) => {
    setDeliverStop(s);
    const firstMode = deliveryModes[0]?.key ?? "persoenlich";
    setDeliveryMode(firstMode);
    setDeliveryNote("");
    setDeliveryRecipient("");
    setHasSignature(false);
    setSignatureOpen(false);
    setPhotoDataUrl(null);
  };

  const submitDelivery = () => {
    if (!deliverStop) return;
    if (!activeMode) {
      toast.error("Übergabe-Art wählen");
      return;
    }
    if (activeMode.photo_required && !photoDataUrl) {
      toast.error("Foto ist für diese Übergabe-Art Pflicht");
      return;
    }
    if (activeMode.recipient_name_required && !deliveryRecipient.trim()) {
      toast.error("Empfängername ist Pflicht");
      return;
    }
    const sig = sigPadRef.current?.toDataURL() ?? null;
    if (activeMode.signature_required && !sig) {
      toast.error("Unterschrift ist Pflicht");
      return;
    }
    updateStatus(deliverStop.id, "erledigt", {
      delivery_mode: deliveryMode,
      delivery_note: deliveryNote.trim() || undefined,
      delivery_recipient: deliveryRecipient.trim() || undefined,
      signature_base64: sig,
      photo_base64: photoDataUrl ?? undefined,
    });
  };

  const handlePhotoSelected = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error("read failed"));
        r.readAsDataURL(file);
      });
      // Compress: max 1280px, JPEG q=0.7
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("img failed"));
        i.src = dataUrl;
      });
      const maxSide = 1280;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setPhotoDataUrl(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      setPhotoDataUrl(canvas.toDataURL("image/jpeg", 0.7));
    } catch (e) {
      console.error(e);
      toast.error("Foto konnte nicht verarbeitet werden");
    }
  };

  const navigate = (s: Stop) => {
    const o = s.order;
    if (!o) return;

    const addrText = `${o.empfaenger_adresse}, ${o.empfaenger_plz} ${o.empfaenger_stadt}`;
    openMapsNavigation(addrText, o.lat, o.lng);
  };

  const navigateToDepot = (depot: Depot) => {
    const addrText = `${depot.strasse}, ${depot.plz} ${depot.stadt}`;
    openMapsNavigation(addrText, depot.lat, depot.lng);
  };

  const openMapsNavigation = (addrText: string, lat: number | null, lng: number | null) => {
    const addr = encodeURIComponent(addrText);
    const hasCoords = lat != null && lng != null;
    const coords = hasCoords ? `${lat},${lng}` : null;

    const ua = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isAndroid = /Android/i.test(ua);

    let url: string;
    if (isIOS) {
      url = coords
        ? `maps://?daddr=${coords}&dirflg=d`
        : `maps://?daddr=${addr}&dirflg=d`;
    } else if (isAndroid) {
      url = coords
        ? `google.navigation:q=${coords}&mode=d`
        : `google.navigation:q=${addr}&mode=d`;
    } else {
      url = coords
        ? `https://www.google.com/maps/dir/?api=1&destination=${coords}&travelmode=driving`
        : `https://www.google.com/maps/dir/?api=1&destination=${addr}&travelmode=driving`;
    }

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
  };

  const done = stops.filter((s) => s.status === "erledigt" || s.status === "uebersprungen").length;
  const total = stops.length;
  const pct = total > 0 ? (done / total) * 100 : 0;
  const nextStop = stops.find(
    (s) => s.status !== "erledigt" && s.status !== "uebersprungen" && s.order,
  ) ?? null;
  const isPlanned = routeStatus === "geplant";
  const isCompleted = routeStatus === "abgeschlossen";

  return (
    <DriverLayout title={routeName} showBack>
      <div className="sticky top-14 bg-card border-b px-4 py-2 z-[5]">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>
            {isPlanned ? "Geplant" : isCompleted ? "Abgeschlossen" : "Aktiv"}
          </span>
          <span>{done} / {total}</span>
        </div>
        <Progress value={pct} className="h-2" />
      </div>

      {isPlanned && (
        <div className="px-4 pt-3">
          <button
            type="button"
            onClick={startRoute}
            disabled={startingRoute}
            className="w-full text-left bg-primary text-primary-foreground rounded-xl p-4 shadow-md active:scale-[0.99] transition-transform disabled:opacity-60"
          >
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-11 h-11 rounded-full bg-primary-foreground/15 flex items-center justify-center">
                {startingRoute ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] uppercase tracking-wide opacity-80">Bereit zur Auslieferung</div>
                <div className="font-semibold">Route starten</div>
                <div className="text-xs opacity-90">
                  Setzt alle {total} Pakete auf „unterwegs"
                </div>
              </div>
            </div>
          </button>
        </div>
      )}

      {isCompleted && (
        <div className="px-4 pt-3">
          <div className="bg-primary text-primary-foreground rounded-xl p-4 shadow-md">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-shrink-0 w-11 h-11 rounded-full bg-primary-foreground/15 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] uppercase tracking-wide opacity-80">Route abgeschlossen</div>
                <div className="font-semibold">Alle Stopps erledigt</div>
                {endDepot && (
                  <div className="text-xs opacity-90 truncate">
                    Zurück zu {endDepot.name}
                  </div>
                )}
              </div>
            </div>
            {endDepot && (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => navigateToDepot(endDepot)}
              >
                <Home className="h-4 w-4 mr-2" />
                Navigation zum Depot
              </Button>
            )}
          </div>
        </div>
      )}

      {!isPlanned && !isCompleted && nextStop?.order && (
        <div className="sticky top-[5.75rem] z-[4] px-4 pt-3">
          <button
            type="button"
            onClick={() => navigate(nextStop)}
            className="w-full text-left bg-primary text-primary-foreground rounded-xl p-4 shadow-md active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-11 h-11 rounded-full bg-primary-foreground/15 flex items-center justify-center">
                <Navigation className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] uppercase tracking-wide opacity-80">
                  Nächster Stopp · #{nextStop.position + 1}
                </div>
                <div className="font-semibold truncate">{nextStop.order.empfaenger_name}</div>
                <div className="text-xs opacity-90 truncate">
                  {nextStop.order.empfaenger_adresse}, {nextStop.order.empfaenger_plz} {nextStop.order.empfaenger_stadt}
                </div>
              </div>
              <ArrowRight className="h-5 w-5 flex-shrink-0 opacity-90" />
            </div>
          </button>
        </div>
      )}

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
                    {(() => {
                      const { customerInstructions, internalNotes } = splitNotes(o.notizen);
                      return (
                        <>
                          {customerInstructions && (
                            <div className="mt-2 p-2 rounded border-2 border-primary/40 bg-primary/10">
                              <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-primary mb-1">
                                <MessageSquare className="h-3 w-3" />
                                Lieferanweisung des Kunden
                              </div>
                              <p className="text-xs whitespace-pre-line text-foreground">
                                {customerInstructions}
                              </p>
                            </div>
                          )}
                          {internalNotes && (
                            <p className="text-xs mt-2 p-2 bg-muted rounded whitespace-pre-line">
                              {internalNotes}
                            </p>
                          )}
                        </>
                      );
                    })()}
                    {isSkipped && s.notiz && <p className="text-xs mt-2 p-2 bg-destructive/10 text-destructive rounded">Grund: {s.notiz}</p>}
                  </div>
                </div>

                {!isDone && !isSkipped && (
                  <div className="mt-4 space-y-2.5">
                    <Button
                      className="w-full h-14 text-base font-semibold active:scale-[0.98] transition-transform"
                      onClick={() => {
                        if (isPlanned) {
                          toast.info("Bitte zuerst Route starten");
                          return;
                        }
                        openDeliverSheet(s);
                      }}
                      disabled={submitting || isPlanned}
                    >
                      <CheckCircle2 className="h-5 w-5 mr-2" />
                      Zugestellt
                    </Button>
                    <div className="grid grid-cols-2 gap-2.5">
                      <Button
                        variant="outline"
                        className="h-12 text-sm active:scale-[0.98] transition-transform"
                        onClick={() => navigate(s)}
                      >
                        <Navigation className="h-4 w-4 mr-2" />
                        Navi
                      </Button>
                      {o.empfaenger_telefon ? (
                        <Button
                          variant="outline"
                          className="h-12 text-sm active:scale-[0.98] transition-transform"
                          asChild
                        >
                          <a href={`tel:${o.empfaenger_telefon}`}>
                            <Phone className="h-4 w-4 mr-2" />
                            Anrufen
                          </a>
                        </Button>
                      ) : (
                        <Button variant="outline" className="h-12 text-sm" disabled>
                          <Phone className="h-4 w-4 mr-2 opacity-30" />
                          Anrufen
                        </Button>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      className="w-full h-12 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive active:scale-[0.98] transition-transform"
                      disabled={isPlanned}
                      onClick={() => {
                        if (isPlanned) {
                          toast.info("Bitte zuerst Route starten");
                          return;
                        }
                        setActiveStop(s); setReason(REASONS[0]); setExtraNote("");
                      }}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
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
        <SheetContent
          side="bottom"
          className="rounded-t-2xl pb-[max(env(safe-area-inset-bottom),1rem)]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetHeader>
            <SheetTitle>Grund auswählen</SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-4">
            <RadioGroup value={reason} onValueChange={setReason} className="space-y-2">
              {REASONS.map((r) => (
                <label
                  key={r}
                  htmlFor={`reason-${r}`}
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors min-h-[56px] ${
                    reason === r
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <RadioGroupItem value={r} id={`reason-${r}`} />
                  <span className="font-medium text-sm flex-1">{r}</span>
                </label>
              ))}
            </RadioGroup>
            <Textarea
              placeholder="Notiz (optional, tippen zum Schreiben)"
              value={extraNote}
              onChange={(e) => setExtraNote(e.target.value)}
              rows={2}
              className="text-base"
            />
            <Button
              className="w-full h-14 text-base font-semibold"
              variant="destructive"
              disabled={submitting}
              onClick={() => {
                if (!activeStop) return;
                const fullReason = extraNote ? `${reason} – ${extraNote}` : reason;
                updateStatus(activeStop.id, "uebersprungen", { reason: fullReason });
              }}
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Bestätigen"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={!!deliverStop} onOpenChange={(o) => !o && setDeliverStop(null)}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl max-h-[92vh] overflow-y-auto pb-[max(env(safe-area-inset-bottom),1rem)]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetHeader>
            <SheetTitle>Zustellung bestätigen</SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-5">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground mb-2 block">
                Übergabe-Art
              </Label>
              <RadioGroup
                value={deliveryMode}
                onValueChange={(v) => setDeliveryMode(v)}
                className="space-y-2"
              >
                {deliveryModes.map((m) => (
                  <label
                    key={m.key}
                    htmlFor={`mode-${m.key}`}
                    className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors min-h-[56px] ${
                      deliveryMode === m.key
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    <RadioGroupItem value={m.key} id={`mode-${m.key}`} className="mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{m.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                        {m.photo_required && <span>📷 Foto</span>}
                        {m.signature_required && <span>✍️ Unterschrift</span>}
                        {m.recipient_name_required && <span>👤 Name</span>}
                        {!m.photo_required && !m.signature_required && !m.recipient_name_required && (
                          <span>Keine Pflichtfelder</span>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>

            {activeMode?.recipient_name_required && (
              <div>
                <Label htmlFor="recipient" className="text-sm font-medium mb-1.5 block">
                  Empfängername <span className="text-destructive">*</span>
                </Label>
                <input
                  id="recipient"
                  className="w-full h-12 px-3 rounded-md border bg-background text-base"
                  value={deliveryRecipient}
                  onChange={(e) => setDeliveryRecipient(e.target.value)}
                  placeholder="z. B. Familie Müller"
                  autoComplete="off"
                />
              </div>
            )}

            <div>
              <Label htmlFor="delivery-note" className="text-sm font-medium mb-1.5 block">
                Bemerkung (optional)
              </Label>
              <Textarea
                id="delivery-note"
                placeholder="Tippen um zu schreiben…"
                value={deliveryNote}
                onChange={(e) => setDeliveryNote(e.target.value)}
                rows={2}
                className="text-base"
              />
            </div>

            {(activeMode?.signature_required || activeMode?.key === "persoenlich") && (
              <Button
                type="button"
                variant="outline"
                className="w-full h-14 text-base"
                onClick={() => setSignatureOpen(true)}
              >
                <PenLine className="h-5 w-5 mr-2" />
                {hasSignature ? "Unterschrift bearbeiten" : "Unterschrift hinzufügen"}
                {activeMode?.signature_required && !hasSignature && (
                  <span className="text-destructive ml-1">*</span>
                )}
                {hasSignature && <CheckCircle2 className="h-5 w-5 ml-2 text-primary" />}
              </Button>
            )}

            <div className="space-y-2">
              <Label className="text-sm font-medium block">
                Zustellfoto
                {activeMode?.photo_required && !photoDataUrl && (
                  <span className="text-destructive ml-1">*</span>
                )}
              </Label>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  handlePhotoSelected(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              {photoDataUrl ? (
                <div className="space-y-2">
                  <img
                    src={photoDataUrl}
                    alt="Zustellfoto"
                    className="w-full max-h-56 object-contain rounded-md border bg-muted"
                  />
                  <div className="grid grid-cols-2 gap-2.5">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12"
                      onClick={() => photoInputRef.current?.click()}
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Neu aufnehmen
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-12 text-destructive hover:text-destructive"
                      onClick={() => setPhotoDataUrl(null)}
                    >
                      Entfernen
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-14 text-base"
                  onClick={() => photoInputRef.current?.click()}
                >
                  <Camera className="h-5 w-5 mr-2" />
                  Foto aufnehmen
                </Button>
              )}
            </div>

            <Button
              className="w-full h-14 text-base font-semibold"
              disabled={submitting}
              onClick={submitDelivery}
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                  Zustellung bestätigen
                </>
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {signatureOpen && (
        <div className="fixed inset-0 z-[100] bg-background flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b pt-[max(env(safe-area-inset-top),0.75rem)]">
            <div>
              <div className="font-semibold text-base">Unterschrift</div>
              <div className="text-xs text-muted-foreground">Mit dem Finger zeichnen</div>
            </div>
            <Button
              variant="outline"
              className="h-11 px-4"
              onClick={() => sigPadRef.current?.clear()}
            >
              Löschen
            </Button>
          </div>
          <div className="flex-1 p-4 min-h-0">
            <SignaturePad ref={sigPadRef} className="w-full h-full bg-white border-2 border-dashed rounded-md touch-none select-none" />
          </div>
          <div className="grid grid-cols-2 gap-2.5 p-4 border-t pb-[max(env(safe-area-inset-bottom),1rem)]">
            <Button
              variant="outline"
              className="h-14 text-base"
              onClick={() => {
                sigPadRef.current?.clear();
                setHasSignature(false);
                setSignatureOpen(false);
              }}
            >
              Abbrechen
            </Button>
            <Button
              className="h-14 text-base font-semibold"
              onClick={() => {
                const empty = sigPadRef.current?.isEmpty() ?? true;
                setHasSignature(!empty);
                setSignatureOpen(false);
              }}
            >
              <CheckCircle2 className="h-5 w-5 mr-2" />
              Übernehmen
            </Button>
          </div>
        </div>
      )}
    </DriverLayout>
  );
};

export default DriverRouteDetailPage;