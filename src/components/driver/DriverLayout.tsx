import { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Home, User, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DriverLayoutProps {
  children: ReactNode;
  title?: string;
  showBack?: boolean;
}

export const DriverLayout = ({ children, title, showBack }: DriverLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-card border-b px-4 h-14 flex items-center gap-2 shadow-sm pt-[env(safe-area-inset-top)]">
        {showBack && (
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="-ml-2 h-11 w-11">
            <ArrowLeft className="h-6 w-6" />
          </Button>
        )}
        <h1 className="font-semibold text-lg flex-1 truncate">{title ?? "e-cargo"}</h1>
      </header>
      <main className="flex-1 pb-[calc(env(safe-area-inset-bottom)+5rem)]">{children}</main>
      <nav className="fixed bottom-0 inset-x-0 bg-card border-t flex h-16 z-10 pb-[env(safe-area-inset-bottom)]">
        <button
          onClick={() => navigate("/fahrer")}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 text-xs active:bg-muted/50 transition-colors",
            location.pathname === "/fahrer" ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Home className="h-6 w-6" />
          Routen
        </button>
        <button
          onClick={() => navigate("/fahrer/profil")}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 text-xs active:bg-muted/50 transition-colors",
            location.pathname === "/fahrer/profil" ? "text-primary" : "text-muted-foreground",
          )}
        >
          <User className="h-6 w-6" />
          Profil
        </button>
      </nav>
    </div>
  );
};