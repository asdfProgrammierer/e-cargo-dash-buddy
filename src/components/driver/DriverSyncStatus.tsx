import { useEffect, useState } from "react";
import { CloudOff, CloudUpload, CheckCircle2, Loader2 } from "lucide-react";
import { flushQueue, onSyncState, startDeliverySync, type SyncState } from "@/lib/offlineDeliveryQueue";
import { cn } from "@/lib/utils";

/** Kleiner Sync-Status in der Kopfleiste der Fahrer-App. */
export const DriverSyncStatus = () => {
  const [s, setS] = useState<SyncState | null>(null);
  useEffect(() => { startDeliverySync(); return onSyncState(setS); }, []);
  if (!s) return null;

  let icon = <CheckCircle2 className="h-4 w-4" />;
  let label = "Synchron";
  let tone = "text-success border-success/40 bg-success/10";
  if (s.pending > 0 && s.syncing) {
    icon = <Loader2 className="h-4 w-4 animate-spin" />;
    label = `Sende ${s.pending}…`;
    tone = "text-primary border-primary/40 bg-primary/10";
  } else if (s.pending > 0) {
    icon = s.online ? <CloudUpload className="h-4 w-4" /> : <CloudOff className="h-4 w-4" />;
    label = `${s.pending} wartet${s.online ? "" : " · offline"}`;
    tone = "text-warning border-warning bg-warning/10";
  } else if (!s.online) {
    icon = <CloudOff className="h-4 w-4" />;
    label = "Offline";
    tone = "text-warning border-warning bg-warning/10";
  }

  return (
    <button
      type="button"
      onClick={() => void flushQueue()}
      className={cn("flex items-center gap-1.5 rounded-full border px-2.5 h-8 text-xs font-medium shrink-0", tone)}
      aria-label={`Sync-Status: ${label}`}
      title={s.lastError ? `Letzter Fehler: ${s.lastError}` : "Tippen zum erneuten Senden"}
    >
      {icon}
      {label}
    </button>
  );
};
