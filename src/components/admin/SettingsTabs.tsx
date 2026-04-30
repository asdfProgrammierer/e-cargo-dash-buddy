import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { MapPinned, Warehouse, Route as RouteIcon, Mail } from "lucide-react";

const tabs = [
  { to: "/admin/einstellungen/liefergebiet", label: "Liefergebiet", icon: MapPinned },
  { to: "/admin/einstellungen/depots", label: "Depots", icon: Warehouse },
  { to: "/admin/einstellungen/routen", label: "Routen", icon: RouteIcon },
  { to: "/admin/einstellungen/emails", label: "E-Mail-Vorlagen", icon: Mail },
];

export function SettingsTabs() {
  const location = useLocation();
  return (
    <div className="mb-6 border-b border-border">
      <nav className="flex gap-1 -mb-px">
        {tabs.map((tab) => {
          const active = location.pathname.startsWith(tab.to);
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}