import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export function useAdminCheck() {
  const { user, loading } = useAuth();
  const { data, isError } = useQuery({
    queryKey: ["admin-check", user?.id, user?.last_sign_in_at],
    enabled: !loading && !!user,
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase.from("user_roles")
        .select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (error) throw error;
      return !!data;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  if (loading) return null;
  if (!user || isError) return false;
  return data ?? null;
}
