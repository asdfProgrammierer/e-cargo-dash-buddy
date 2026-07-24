import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, FileText } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { getPublicSiteUrl } from "@/lib/siteUrl";
import logoAsset from "@/assets/logo.png.asset.json";
import { PageHead } from "@/components/PageHead";

const LoginPage = () => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [firma, setFirma] = useState("");
  const [agbAccepted, setAgbAccepted] = useState(false);
  const [emailConsent, setEmailConsent] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message);
    }
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agbAccepted) {
      toast.error("Bitte bestätige die AGB, um fortzufahren.");
      return;
    }
    if (!emailConsent) {
      toast.error("Bitte bestätige die Kontaktaufnahme per E-Mail.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getPublicSiteUrl(),
        data: { full_name: fullName, firma_name: firma },
      },
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Registrierung erfolgreich! Bitte bestätige deine E-Mail.");
    }
    setLoading(false);
  };

  return (
    <>
    <PageHead title="Login – e-cargo Händler-Dashboard" description="Melden Sie sich im e-cargo Händler-Dashboard an oder registrieren Sie sich als Händler für nachhaltige Kurierlogistik im Ruhrgebiet." path="/login" />
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
            <img
              src={logoAsset.url}
              alt="e-cargo"
              width={56}
              height={56}
              fetchPriority="high"
              decoding="async"
              className="h-14 w-14 object-cover rounded-2xl"
            />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">e-cargo</h1>
            <p className="text-sm text-muted-foreground">Nachhaltige Logistik · Ruhrgebiet</p>
          </div>
        </div>

        <Card>
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-lg">Händler-Portal</CardTitle>
            <CardDescription>Melde dich an oder erstelle ein Konto</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="w-full mb-4">
                <TabsTrigger value="login" className="flex-1">Anmelden</TabsTrigger>
                <TabsTrigger value="signup" className="flex-1">Registrieren</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label>E-Mail</Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Passwort</Label>
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Anmelden
                  </Button>
                  <div className="text-center">
                    <button
                      type="button"
                      className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
                      onClick={async () => {
                        if (!email) {
                          toast.error("Bitte gib deine E-Mail-Adresse ein");
                          return;
                        }
                        setLoading(true);
                        const { error } = await supabase.auth.resetPasswordForEmail(email, {
                          redirectTo: `${getPublicSiteUrl()}/reset-password`,
                        });
                        if (error) toast.error(error.message);
                        else toast.success("E-Mail zum Zurücksetzen wurde gesendet");
                        setLoading(false);
                      }}
                    >
                      Passwort vergessen?
                    </button>
                  </div>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Firmenname</Label>
                    <Input value={firma} onChange={(e) => setFirma(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>E-Mail</Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Passwort</Label>
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                  </div>
                  <div className="space-y-3 pt-1">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="agb"
                        checked={agbAccepted}
                        onCheckedChange={(v) => setAgbAccepted(v === true)}
                      />
                      <Label htmlFor="agb" className="text-xs font-normal leading-snug cursor-pointer">
                        Ich akzeptiere die{" "}
                        <a
                          href="/agb.pdf"
                          download
                          className="inline-flex items-center gap-1 text-primary underline underline-offset-2 hover:no-underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          AGB <FileText className="h-3 w-3" />
                        </a>
                        .
                      </Label>
                    </div>
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="email-consent"
                        checked={emailConsent}
                        onCheckedChange={(v) => setEmailConsent(v === true)}
                      />
                      <Label htmlFor="email-consent" className="text-xs font-normal leading-snug cursor-pointer">
                        Ich bin damit einverstanden, von e-cargo per E-Mail kontaktiert zu werden.
                      </Label>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Registrieren
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
    </>
  );
};

export default LoginPage;
