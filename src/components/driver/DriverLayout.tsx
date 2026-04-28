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
      <header className="sticky top-0 z-10 bg-card border-b px-4 h-14 flex items-center gap-2 shadow-sm">
        {showBack && (
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="-ml-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <h1 className="font-semibold text-lg flex-1 truncate">{title ?? "e-cargo"}</h1>
      </header>
      <main className="flex-1 pb-20">{children}</main>
      <nav className="fixed bottom-0 inset-x-0 bg-card border-t flex h-16 z-10">
        <button
          onClick={() => navigate("/fahrer")}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 text-xs",
            location.pathname === "/fahrer" ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Home className="h-5 w-5" />
          Routen
        </button>
        <button
          onClick={() => navigate("/fahrer/profil")}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 text-xs",
            location.pathname === "/fahrer/profil" ? "text-primary" : "text-muted-foreground",
          )}
        >
          <User className="h-5 w-5" />
          Profil
        </button>
      </nav>
    </div>
  );
};