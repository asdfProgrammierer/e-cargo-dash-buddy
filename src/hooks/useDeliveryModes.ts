import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DeliveryMode {
  id: string;
  key: string;
  label: string;
  active: boolean;
  photo_required: boolean;
  signature_required: boolean;
  recipient_name_required: boolean;
  sort_order: number;
}

export function useDeliveryModes(opts: { onlyActive?: boolean } = {}) {
  const [modes, setModes] = useState<DeliveryMode[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("delivery_modes")
        .select("id, key, label, active, photo_required, signature_required, recipient_name_required, sort_order")
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      if (error) {
        setModes([]);
      } else {
        const rows = (data ?? []) as DeliveryMode[];
        setModes(opts.onlyActive ? rows.filter((m) => m.active) : rows);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [opts.onlyActive, reloadKey]);

  return { modes, loading, reload: () => setReloadKey((k) => k + 1) };
}