import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export function useExclusiveToursAccess() {
  const { user, ownerUserId } = useAuth();
  return useQuery({
    queryKey: ["exclusive-tours", "access", user?.id, user?.last_sign_in_at, ownerUserId],
    enabled: !!user && !!ownerUserId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("merchant_exclusive_tours_enabled");
      if (error) throw error;
      return data === true;
    },
    staleTime: 0,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
}