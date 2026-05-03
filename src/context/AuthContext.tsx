import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  approved: boolean | null;
  ownerUserId: string | null;
  isSubAccount: boolean | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [approved, setApproved] = useState<boolean | null>(null);
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
  const [isSubAccount, setIsSubAccount] = useState<boolean | null>(null);

  const fetchApproval = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("approved, parent_user_id")
      .eq("user_id", userId)
      .maybeSingle();
    const parent = (data as any)?.parent_user_id ?? null;
    setApproved(data?.approved ?? false);
    setOwnerUserId(parent ?? userId);
    setIsSubAccount(!!parent);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session?.user) {
          fetchApproval(session.user.id);
        } else {
          setApproved(null);
          setOwnerUserId(null);
          setIsSubAccount(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchApproval(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, approved, ownerUserId, isSubAccount, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
