import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Truck, Loader2 } from "lucide-react";

const DriverLoginPage = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim().toLowerCase();
    if (!cleanUser || pin.length < 4) {
      toast.error("Bitte Username und PIN eingeben");
      return;
    }
    setLoading(true);
    const email = `${cleanUser}@drivers.e-cargo.local`;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pin });
    setLoading(false);
    if (error || !data.user) {
      toast.error("Login fehlgeschlagen. Bitte Username und PIN prüfen.");
      return;
    }
    await supabase.rpc("driver_touch_last_login");
    navigate("/fahrer");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-4">
            <Truck className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold">e-cargo Fahrer</h1>
          <p className="text-sm text-muted-foreground mt-1">Bitte melde dich an</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4 bg-card p-6 rounded-2xl border shadow-lg">
          <div>
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              autoCapitalize="none"
              autoCorrect="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="max.mueller"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="pin">PIN</Label>
            <Input
              id="pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••••"
              className="mt-1 text-center text-2xl tracking-widest"
            />
          </div>
          <Button type="submit" className="w-full h-12" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Einloggen"}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default DriverLoginPage;