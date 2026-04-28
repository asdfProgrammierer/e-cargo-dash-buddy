import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export function useDriverCheck() {
  const { user, loading } = useAuth();
  const [isDriver, setIsDriver] = useState<boolean | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);

  useEffect(() => {
    if (loading) {
      setIsDriver(null);
      return;
    }
    if (!user) {
      setIsDriver(false);
      setDriverId(null);
      return;
    }
    supabase
      .from("drivers")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setIsDriver(!!data);
        setDriverId(data?.id ?? null);
      });
  }, [user, loading]);

  return { isDriver, driverId };
}