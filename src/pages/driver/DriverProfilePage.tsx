import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useDriverCheck } from "@/hooks/useDriverCheck";
import { DriverLayout } from "@/components/driver/DriverLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LogOut, UserCircle, AlertTriangle, Loader2 } from "lucide-react";
import { driverBtn } from "@/lib/driverButtonConfig";
import { toast } from "sonner";

interface RouteOption {
  id: string;
  name: string;
  datum: string;
  status: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const DriverProfilePage = () => {
  const { user, signOut } = useAuth();
  const { driverId } = useDriverCheck();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<RouteOption | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("drivers").select("name, username").eq("auth_user_id", user.id).maybeSingle().then(({ data }) => {
      if (data) { setName(data.name); setUsername(data.username ?? ""); }
    });
  }, [user]);

  const openSheet = async () => {
    setSheetOpen(true);
    if (!driverId) return;
    setLoadingRoutes(true);
    const { data } = await supabase
      .from("routes")
      .select("id, name, datum, status")
      .eq("driver_id", driverId)
      .neq("status", "abgeschlossen")
      .gte("datum", todayISO())
      .order("datum", { ascending: true });
    setRoutes((data ?? []) as RouteOption[]);
    setLoadingRoutes(false);
  };

  const handleAbort = async () => {
    if (!selectedRoute) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("driver-abort-route", {
      body: { route_id: selectedRoute.id },
    });
    setSubmitting(false);
    setConfirmOpen(false);
    if (error) {
      toast.error("Route konnte nicht beendet werden");
      return;
    }
    const res = data as { affected_orders?: number } | null;
    toast.success(
      `Route beendet. ${res?.affected_orders ?? 0} Kunden wurden per E-Mail informiert.`,
    );
    setSheetOpen(false);
    setSelectedRoute(null);
    navigate("/fahrer");
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/fahrer/login");
  };

  const fmtDate = (d: string) =>
    d === todayISO()
      ? "Heute"
      : new Date(d).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });

  return (
    <DriverLayout title="Profil">
      <div className="p-4 space-y-4">
        <div className="bg-card border rounded-xl p-6 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-3">
            <UserCircle className="h-10 w-10" />
          </div>
          <h2 className="font-semibold text-lg">{name}</h2>
          <p className="text-sm text-muted-foreground">@{username}</p>
        </div>

        <div className="bg-card border rounded-xl p-4 space-y-3">
          <div>
            <p className="font-medium text-sm">Notfall / Panne</p>
            <p className="text-xs text-muted-foreground">
              Tour vorzeitig beenden – offene Kunden werden automatisch informiert.
            </p>
          </div>
          <Button variant="destructive" className={driverBtn.form} onClick={openSheet}>
            <AlertTriangle className="h-4 w-4 mr-2" />
            Route beenden
          </Button>
        </div>

        <Button variant="outline" className={driverBtn.form} onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-2" />
          Abmelden
        </Button>
        <p className="text-xs text-center text-muted-foreground pt-4">e-cargo Fahrer-App v1.0</p>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle>Route beenden</SheetTitle>
            <SheetDescription>
              Wähle die Route aus, die du vorzeitig beenden möchtest.
            </SheetDescription>
          </SheetHeader>
          <div className="py-4 space-y-2 max-h-[50vh] overflow-y-auto">
            {loadingRoutes ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : routes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Keine offene Route vorhanden.
              </p>
            ) : (
              routes.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setSelectedRoute(r);
                    setConfirmOpen(true);
                  }}
                  className="w-full text-left border rounded-xl p-3 active:scale-[0.98] transition-transform"
                >
                  <p className="font-medium text-sm truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(r.datum)} • {r.status === "aktiv" ? "Aktiv" : "Geplant"}
                  </p>
                </button>
              ))
            )}
          </div>
          <Label className="sr-only">Route auswählen</Label>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Route wirklich beenden?</AlertDialogTitle>
            <AlertDialogDescription>
              „{selectedRoute?.name}“ wird beendet. Alle noch offenen Kunden erhalten eine
              Entschuldigungs-E-Mail und werden für die nächstmögliche Tour neu eingeplant.
              Das lässt sich nicht rückgängig machen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleAbort();
              }}
              disabled={submitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Route beenden
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DriverLayout>
  );
};

export default DriverProfilePage;
