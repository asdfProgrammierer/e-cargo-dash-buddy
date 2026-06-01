import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { enablePush, disablePush, isPushActive, isPushSupported } from "@/lib/push";

interface PushToggleProps {
  /** Optional label override */
  label?: string;
  /** Compact icon-only style for header use */
  compact?: boolean;
  className?: string;
}

export function PushToggle({ label, compact = false, className }: PushToggleProps) {
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const s = isPushSupported();
    setSupported(s);
    if (s) isPushActive().then(setActive);
  }, []);

  if (!supported) return null;

  const toggle = async () => {
    setBusy(true);
    if (active) {
      const res = await disablePush();
      if (res.ok) {
        setActive(false);
        toast.success("Benachrichtigungen deaktiviert");
      } else if (res.error) toast.error(res.error);
    } else {
      const res = await enablePush();
      if (res.ok) {
        setActive(true);
        toast.success("Benachrichtigungen aktiviert");
      } else if (res.error) toast.error(res.error);
    }
    setBusy(false);
  };

  const Icon = active ? Bell : BellOff;

  if (compact) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={toggle}
        disabled={busy}
        className={className}
        title={active ? "Benachrichtigungen aktiv" : "Benachrichtigungen aktivieren"}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={active ? "secondary" : "default"}
      onClick={toggle}
      disabled={busy}
      className={className}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
      ) : (
        <Icon className="h-4 w-4 mr-2" />
      )}
      {label ?? (active ? "Benachrichtigungen aktiv" : "Benachrichtigungen aktivieren")}
    </Button>
  );
}