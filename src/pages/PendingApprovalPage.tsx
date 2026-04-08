import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Leaf, Clock, LogOut } from "lucide-react";

const PendingApprovalPage = () => {
  const { signOut, user } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
            <Leaf className="h-7 w-7 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">e-cargo</h1>
            <p className="text-sm text-muted-foreground">Nachhaltige Logistik · Ruhrgebiet</p>
          </div>
        </div>

        <Card>
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <CardTitle className="text-lg">Freigabe ausstehend</CardTitle>
            <CardDescription>
              Dein Konto ({user?.email}) wurde erfolgreich erstellt und deine E-Mail bestätigt.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Dein Account wird gerade von unserem Team geprüft. Du erhältst eine Benachrichtigung, sobald dein Konto freigeschaltet wurde.
              </p>
            </div>
            <Button variant="outline" className="w-full" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Abmelden
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PendingApprovalPage;
