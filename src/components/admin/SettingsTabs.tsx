import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Route as RouteIcon, Users, FileText, ShieldCheck } from "lucide-react";

/** Einstellungen in 4 Bereiche gruppiert; jeder Bereich hat eigene Unterseiten. */
const groups = [
  {
    label: "Touren & Logistik",
    icon: RouteIcon,
    items: [
      { to: "/admin/einstellungen/depots", label: "Depots & Stopp-Dauer" },
      { to: "/admin/einstellungen/liefergebiet", label: "Liefergebiet" },
    ],
  },
  {
    label: "Fahrer & Zustellung",
    icon: Users,
    items: [
      { to: "/admin/einstellungen/einsatzplan", label: "Einsatzplan" },
      { to: "/admin/einstellungen/uebergabe", label: "Übergabe-Modi" },
    ],
  },
  {
    label: "Vorlagen & Tarife",
    icon: FileText,
    items: [
      { to: "/admin/einstellungen/emails", label: "E-Mail-Vorlagen" },
      { to: "/admin/einstellungen/dhl", label: "DHL-Tarife" },
    ],
  },
  {
    label: "System & Konto",
    icon: ShieldCheck,
    items: [{ to: "/admin/einstellungen/konto", label: "Konto, Admins & Wartung" }],
  },
];

export function SettingsTabs() {
  const { pathname } = useLocation();
  const activeGroup = groups.find((g) => g.items.some((i) => pathname.startsWith(i.to))) ?? groups[0];

  return (
    <div className="mb-6 space-y-3">
      <nav className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {groups.map((g) => {
          const Icon = g.icon;
          const active = g === activeGroup;
          return (
            <NavLink
              key={g.label}
              to={g.items[0].to}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{g.label}</span>
            </NavLink>
          );
        })}
      </nav>
      {activeGroup.items.length > 1 && (
        <nav className="flex flex-wrap gap-1 border-b border-border">
          {activeGroup.items.map((i) => {
            const active = pathname.startsWith(i.to);
            return (
              <NavLink
                key={i.to}
                to={i.to}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {i.label}
              </NavLink>
            );
          })}
        </nav>
      )}
    </div>
  );
}
