import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { DriverLayout } from "@/components/driver/DriverLayout";
import { Button } from "@/components/ui/button";
import { LogOut, UserCircle } from "lucide-react";

const DriverProfilePage = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase.from("drivers").select("name, username").eq("auth_user_id", user.id).maybeSingle().then(({ data }) => {
      if (data) { setName(data.name); setUsername(data.username ?? ""); }
    });
  }, [user]);

  const handleLogout = async () => {
    await signOut();
    navigate("/fahrer/login");
  };

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
        <Button variant="outline" className="w-full" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-2" />
          Abmelden
        </Button>
        <p className="text-xs text-center text-muted-foreground pt-4">e-cargo Fahrer-App v1.0</p>
      </div>
    </DriverLayout>
  );
};

export default DriverProfilePage;